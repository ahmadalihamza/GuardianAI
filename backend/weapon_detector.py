"""Weapon detection and person association for GuardianAI.

**What COCO can and cannot do.** The bundled YOLO11n weights include `knife`
(43), `scissors` (76) and `baseball bat` (34) — real, usable detections — but no
firearm class of any kind. So this module does two things:

1. Treats those three COCO classes as weapon proxies, each with its own
   seriousness weight, because a pair of scissors is not a machete.
2. Accepts an optional fine-tuned checkpoint via `WEAPON_MODEL_PATH` whose
   `pistol` / `gun` / `rifle` / `knife` labels are merged into the same pipeline.
   Without it, GuardianAI does not claim to detect firearms, and the UI says so.

**Why association matters.** A knife on a kitchen worktop and a knife in
someone's hand are the same box to a detector and completely different events to
an operator. Each weapon box is matched against the person tracks in the same
frame; when the weapon sits within `WEAPON_PERSON_PROXIMITY` person-widths of a
person, the incident is escalated from "Weapon Detected" to "Armed Person" and
carries that person's track ID so the dashboard can link the two.

Confidence is a rolling mean over the weapon track's recent observations rather
than the instantaneous score, because small objects flicker between 0.3 and 0.7
frame to frame and the peak value alone is not representative.
"""
from collections import deque
from typing import Optional

import numpy as np

from backend import coco_classes
from backend.config import (
    CONFIDENCE_SMOOTHING_WINDOW,
    INCIDENT_COOLDOWN_SECONDS,
    WEAPON_CONFIDENCE_THRESHOLD,
    WEAPON_MODEL_PATH,
    WEAPON_PERSISTENCE_FRAMES,
    WEAPON_PERSON_PROXIMITY,
)
from backend.risk_engine import (
    compute_risk_score,
    get_seriousness_for_event,
    get_severity,
)

#: Relative seriousness per weapon type, applied as a multiplier on the event
#: type's base seriousness. A knife is the reference (1.0); a baseball bat is a
#: blunt instrument and scissors are frequently a benign household object, so
#: both are discounted rather than dropped.
WEAPON_CLASS_WEIGHT: dict[int, float] = {
    coco_classes.KNIFE: 1.00,
    coco_classes.BASEBALL_BAT: 0.82,
    coco_classes.SCISSORS: 0.66,
}

#: Class id namespace for weapons that came from the optional custom checkpoint
#: rather than from COCO. Kept out of the COCO range on purpose.
FIREARM_CLASS_ID = -100

WEAPON_CLASS_WEIGHT[FIREARM_CLASS_ID] = 1.00

#: Substrings in a custom model's label that mean "firearm".
_FIREARM_KEYWORDS = ("gun", "pistol", "rifle", "firearm", "weapon", "handgun")
_BLADE_KEYWORDS = ("knife", "blade", "machete", "dagger")


def gap_ratio(
    weapon_bbox: tuple[float, float, float, float],
    person_bbox: tuple[float, float, float, float],
) -> float:
    """Distance from a weapon's centre to a person's box, in person-widths.

    Returns 0.0 when the weapon's centre falls inside the person box. Scaling by
    the person's width makes the threshold scale-invariant: a weapon "in reach"
    is the same fraction of a body width whether the person is near the camera or
    far from it.
    """
    wx = (weapon_bbox[0] + weapon_bbox[2]) / 2.0
    wy = (weapon_bbox[1] + weapon_bbox[3]) / 2.0
    px1, py1, px2, py2 = person_bbox
    dx = max(px1 - wx, 0.0, wx - px2)
    dy = max(py1 - wy, 0.0, wy - py2)
    width = max(px2 - px1, 1.0)
    return float((dx * dx + dy * dy) ** 0.5 / width)


def _state_key(track_id: int, class_id: int) -> int:
    """State key for a weapon observation.

    Tracked objects key on their ByteTrack ID. Untracked ones — small objects the
    tracker declined to associate, and everything from the custom checkpoint —
    collapse to a single key per class so that persistence still accumulates
    instead of resetting every frame.
    """
    if track_id is not None and track_id >= 0:
        return int(track_id)
    return -1000 - abs(int(class_id))


class WeaponTrackState:
    """Per-weapon-track state: observation count, confidence window, cooldown."""

    def __init__(self, key: int):
        self.key = key
        self.observations = 0
        self.confidences: deque[float] = deque(maxlen=max(CONFIDENCE_SMOOTHING_WINDOW, 1))
        self.incident_created = False
        self.last_incident_frame = -9999
        self.last_seen_frame = -9999
        #: Highest escalation already reported for this track. Prevents a second
        #: "Weapon Detected" incident, but still allows one upgrade to
        #: "Armed Person" if the object is later picked up.
        self.reported_armed = False

    @property
    def mean_confidence(self) -> float:
        if not self.confidences:
            return 0.0
        return float(sum(self.confidences) / len(self.confidences))


class WeaponDetector:
    """Stateful per-video weapon detector with person association.

    One instance per video. `process_frame` receives the detections that
    `detector.detect_objects` already produced for this frame (so no second
    inference pass is needed for the COCO classes) plus the raw frame, which is
    only used when a custom firearm checkpoint is configured.
    """

    def __init__(self, model_path: str = WEAPON_MODEL_PATH):
        self.fps: float = 30.0
        self.states: dict[int, WeaponTrackState] = {}
        self.model_path = model_path
        self._model = None
        self._model_failed = False

    def set_fps(self, fps: float) -> None:
        self.fps = max(float(fps), 1.0)

    def reset(self) -> None:
        self.states.clear()

    @property
    def uses_custom_model(self) -> bool:
        """True when a fine-tuned firearm checkpoint is contributing detections."""
        return bool(self.model_path) and not self._model_failed

    def _get_state(self, key: int) -> WeaponTrackState:
        state = self.states.get(key)
        if state is None:
            state = WeaponTrackState(key)
            self.states[key] = state
        return state

    def _load_model(self):
        if self._model is not None or self._model_failed or not self.model_path:
            return self._model
        try:
            from ultralytics import YOLO

            self._model = YOLO(self.model_path)
        except Exception as exc:  # pragma: no cover - depends on user weights
            print(f"Warning: could not load WEAPON_MODEL_PATH ({exc}); COCO classes only.")
            self._model_failed = True
        return self._model

    def _model_weapons(self, frame_bgr: np.ndarray) -> list[dict]:
        """Weapon boxes from the optional custom checkpoint, in detector shape.

        These carry no ByteTrack ID, so `_state_key` collapses them to one state
        per weapon *class*. Persistence therefore accumulates while any firearm
        remains visible, which is the behaviour an operator expects.
        """
        model = self._load_model()
        if model is None:
            return []
        try:
            results = model.predict(
                source=frame_bgr,
                verbose=False,
                device="cpu",
                conf=WEAPON_CONFIDENCE_THRESHOLD,
            )
        except Exception as exc:  # pragma: no cover - depends on user weights
            print(f"Warning: weapon model inference failed ({exc}); COCO classes only.")
            self._model_failed = True
            return []
        if not results:
            return []
        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            return []
        names = getattr(results[0], "names", None) or {}
        out: list[dict] = []
        for i in range(len(boxes)):
            box = boxes[i]
            xyxy = box.xyxy.cpu().numpy().flatten()
            if len(xyxy) < 4:
                continue
            raw_id = int(box.cls.item()) if box.cls is not None else -1
            label = str(names.get(raw_id, "")).lower()
            if any(word in label for word in _FIREARM_KEYWORDS):
                class_id, class_name = FIREARM_CLASS_ID, "firearm"
            elif any(word in label for word in _BLADE_KEYWORDS):
                class_id, class_name = coco_classes.KNIFE, "knife"
            else:
                continue
            out.append({
                "track_id": -1,
                "bbox": (float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])),
                "confidence": float(box.conf.item()) if box.conf is not None else 0.0,
                "class_id": class_id,
                "class_name": class_name,
            })
        return out

    @staticmethod
    def _nearest_person(
        weapon_bbox: tuple[float, float, float, float],
        people: list[dict],
    ) -> tuple[int, Optional[float]]:
        """Track ID and gap of the closest person, or (-1, None) if nobody."""
        best_id = -1
        best_gap: Optional[float] = None
        for person in people:
            gap = gap_ratio(weapon_bbox, tuple(float(v) for v in person["bbox"]))
            if best_gap is None or gap < best_gap:
                best_gap = gap
                best_id = int(person.get("track_id", -1))
        return best_id, best_gap

    def process_frame(
        self,
        detections: list[dict],
        frame_number: int,
        frame_bgr: Optional[np.ndarray] = None,
    ) -> list[dict]:
        """Return any new weapon events for this frame.

        `detections` is the output of `detector.detect_objects` for this frame —
        people and weapon proxies arrive together, which is what makes the
        association step free.
        """
        people = [
            det for det in detections
            if det.get("class_id") == coco_classes.PERSON
            and int(det.get("track_id", -1)) >= 0
        ]
        weapons = [
            det for det in detections
            if coco_classes.is_weapon_proxy(int(det.get("class_id", -1)))
        ]
        if frame_bgr is not None and self.uses_custom_model:
            weapons = weapons + self._model_weapons(frame_bgr)

        events: list[dict] = []
        for det in weapons:
            event = self._step_weapon(det, people, frame_number)
            if event is not None:
                events.append(event)

        self._expire_states(frame_number)
        return events

    def _step_weapon(
        self,
        det: dict,
        people: list[dict],
        frame_number: int,
    ) -> Optional[dict]:
        confidence_now = float(det.get("confidence", 0.0))
        if confidence_now < WEAPON_CONFIDENCE_THRESHOLD:
            return None

        class_id = int(det.get("class_id", -1))
        bbox = tuple(float(v) for v in det["bbox"])
        state = self._get_state(_state_key(int(det.get("track_id", -1)), class_id))
        state.observations += 1
        state.confidences.append(confidence_now)
        state.last_seen_frame = frame_number

        holder_id, gap = self._nearest_person(bbox, people)
        armed = gap is not None and gap <= WEAPON_PERSON_PROXIMITY

        # A brand-new box is unreliable: small objects are the classes YOLO most
        # often hallucinates for a single frame.
        if state.observations < WEAPON_PERSISTENCE_FRAMES:
            return None

        if state.incident_created:
            cooled = (
                frame_number - state.last_incident_frame
                > self.fps * INCIDENT_COOLDOWN_SECONDS
            )
            # An object that was lying on the floor and has now been picked up is
            # a genuinely new situation, so one upgrade bypasses the cooldown.
            upgrade = armed and not state.reported_armed
            if not cooled and not upgrade:
                return None

        state.incident_created = True
        state.last_incident_frame = frame_number
        if armed:
            state.reported_armed = True

        return self._build_event(
            class_id=class_id,
            class_name=str(det.get("class_name") or coco_classes.class_name(class_id)),
            bbox=bbox,
            frame_number=frame_number,
            confidence=state.mean_confidence,
            observations=state.observations,
            holder_id=holder_id if armed else -1,
            gap=gap,
            armed=armed,
        )

    def _build_event(
        self,
        class_id: int,
        class_name: str,
        bbox: tuple[float, float, float, float],
        frame_number: int,
        confidence: float,
        observations: int,
        holder_id: int,
        gap: Optional[float],
        armed: bool,
    ) -> dict:
        event_type = "Armed Person" if armed else "Weapon Detected"
        weight = WEAPON_CLASS_WEIGHT.get(class_id, 0.70)
        seriousness = round(min(get_seriousness_for_event(event_type) * weight, 1.0), 3)
        persistence = min(observations / (WEAPON_PERSISTENCE_FRAMES * 3.0), 1.0)
        # Weapons are context-critical regardless of scene, but an unattended
        # object on the ground is less urgent than one in someone's hand.
        context = 0.85 if armed else 0.55
        confidence = round(min(max(confidence, 0.0), 1.0), 3)

        if armed:
            explanation = (
                f"A {class_name} was detected within {gap:.2f} person-widths of "
                f"person #{holder_id} across {observations} processed frames "
                f"(mean confidence {confidence:.0%}), which is close enough to be "
                "held or carried."
            )
        else:
            distance = "no person nearby" if gap is None else f"nearest person {gap:.2f} widths away"
            explanation = (
                f"A {class_name} was detected across {observations} processed frames "
                f"(mean confidence {confidence:.0%}) with {distance}. Logged as an "
                "unattended weapon rather than an armed person."
            )
        if class_id == FIREARM_CLASS_ID:
            explanation += " Source: fine-tuned firearm checkpoint."
        else:
            explanation += (
                f" Source: COCO class '{class_name}', weighted at "
                f"{weight:.2f} of full weapon seriousness."
            )

        risk = compute_risk_score(
            confidence=confidence,
            seriousness=seriousness,
            persistence=persistence,
            context=context,
        )
        return {
            "event_type": event_type,
            "track_id": holder_id,
            "frame": frame_number,
            "timestamp": frame_number / self.fps,
            "confidence": confidence,
            "risk_score": risk,
            "severity": get_severity(risk),
            "explanation": explanation,
            "seriousness": seriousness,
            "persistence": round(persistence, 3),
            "context": context,
            "bbox": tuple(int(round(v)) for v in bbox),
            "detection_method": "model" if class_id == FIREARM_CLASS_ID else "coco",
            "weapon_class": class_name,
        }

    def _expire_states(self, frame_number: int) -> None:
        """Forget tracks that have been gone for longer than the cooldown.

        Without this the state dict grows for the length of the video, and a
        weapon that leaves and re-enters the scene minutes later would be
        suppressed by a cooldown that should have lapsed.
        """
        horizon = self.fps * INCIDENT_COOLDOWN_SECONDS * 2
        stale = [
            key for key, state in self.states.items()
            if frame_number - state.last_seen_frame > horizon
        ]
        for key in stale:
            del self.states[key]
