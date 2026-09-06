"""Fire and smoke detection for GuardianAI.

**Why this is not a YOLO class.** The bundled YOLO11n checkpoint is trained on
COCO-80, which has no `fire` and no `smoke` label. Rather than pretend
otherwise, this module implements a classical-CV detector and treats a
fine-tuned checkpoint as an optional upgrade (`FIRE_MODEL_PATH`).

**How the heuristic works.** Colour alone is a bad fire detector — a traffic
cone, a hi-vis jacket and a sunset all pass an "orange pixels" test. Three
independent signals are combined instead, and all of them must agree:

1. *Chromatic gate.* Flames occupy a narrow band of HSV: hue at the red/orange
   end, high saturation, high value. Additionally R > G > B holds for almost all
   visible combustion, which rejects saturated reds that are merely bright.
2. *Temporal flicker.* Fire boundaries move continuously at ~5-15 Hz. The mask
   is diffed against a short history and the mean absolute change inside the
   candidate region becomes a flicker score. Static orange objects score ~0.
3. *Persistence.* The above must hold for `FIRE_PERSISTENCE_FRAMES` consecutive
   processed frames before an event is emitted, which removes single-frame
   colour artefacts from compression and headlights.

Smoke uses a different signature: low saturation, mid value, *and* genuine
motion (frame differencing), because a grey wall is not smoke.

Both paths report a calibrated confidence and are labelled as heuristic
throughout the UI. This is decision support for an operator, not a certified
fire-alarm system — see the limitations section of the README.
"""
from collections import deque
from typing import Optional

import cv2
import numpy as np

from backend.config import (
    ENABLE_SMOKE_DETECTION,
    FIRE_MIN_AREA_RATIO,
    FIRE_MIN_FLICKER_SCORE,
    FIRE_MODEL_PATH,
    FIRE_PERSISTENCE_FRAMES,
    SMOKE_MIN_AREA_RATIO,
    SMOKE_PERSISTENCE_FRAMES,
)
from backend.risk_engine import (
    compute_risk_score,
    get_seriousness_for_event,
    get_severity,
)

# Flame chromatic band. Hue wraps at 180 in OpenCV, so red needs two windows.
_FIRE_HSV_RANGES = (
    ((0, 90, 150), (28, 255, 255)),     # red → yellow
    ((165, 90, 150), (180, 255, 255)),  # deep red (wrap-around)
)
_SMOKE_HSV_RANGE = ((0, 0, 70), (180, 55, 215))

_MORPH_KERNEL = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))


def _largest_region(mask: np.ndarray) -> tuple[float, Optional[tuple[int, int, int, int]]]:
    """Area (in pixels) and bbox of the largest connected component."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return 0.0, None
    largest = max(contours, key=cv2.contourArea)
    area = float(cv2.contourArea(largest))
    if area <= 0:
        return 0.0, None
    x, y, w, h = cv2.boundingRect(largest)
    return area, (int(x), int(y), int(x + w), int(y + h))


def fire_mask(frame_bgr: np.ndarray) -> np.ndarray:
    """Binary mask of pixels whose colour is consistent with flame."""
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
    for lower, upper in _FIRE_HSV_RANGES:
        mask |= cv2.inRange(hsv, np.array(lower, np.uint8), np.array(upper, np.uint8))

    # Combustion is red-dominant: R > G > B. This is the single most effective
    # filter against saturated non-fire reds (brake lights, painted surfaces),
    # which tend to have G ≈ B.
    blue, green, red = cv2.split(frame_bgr.astype(np.int16))
    dominance = ((red > green + 12) & (green >= blue)).astype(np.uint8) * 255
    mask = cv2.bitwise_and(mask, dominance)

    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _MORPH_KERNEL)
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, _MORPH_KERNEL)


def smoke_mask(frame_bgr: np.ndarray, previous_gray: Optional[np.ndarray]) -> np.ndarray:
    """Binary mask of desaturated, *moving* pixels — the smoke signature."""
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    lower, upper = _SMOKE_HSV_RANGE
    mask = cv2.inRange(hsv, np.array(lower, np.uint8), np.array(upper, np.uint8))

    if previous_gray is None:
        return np.zeros(mask.shape, dtype=np.uint8)

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    if gray.shape != previous_gray.shape:
        return np.zeros(mask.shape, dtype=np.uint8)

    # Smoke drifts. Requiring motion rejects static grey scenery, which is
    # otherwise indistinguishable by colour alone.
    motion = cv2.threshold(cv2.absdiff(gray, previous_gray), 8, 255, cv2.THRESH_BINARY)[1]
    motion = cv2.dilate(motion, _MORPH_KERNEL, iterations=2)
    mask = cv2.bitwise_and(mask, motion)
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, _MORPH_KERNEL)


class FireSmokeDetector:
    """Stateful per-video fire and smoke detector.

    One instance per video. `process_frame` is called with the *unannotated*
    frame and returns zero or one event dict per category, shaped like the
    events produced by `event_detector.EventDetector` so the rest of the
    pipeline treats them identically.
    """

    #: How many recent fire masks to keep for the flicker calculation. Four
    #: processed frames is roughly 0.25 s at 30 fps with frame skipping, which
    #: comfortably straddles the flame flicker period.
    FLICKER_HISTORY = 4

    def __init__(self, model_path: str = FIRE_MODEL_PATH):
        self.fps: float = 30.0
        self._mask_history: deque[np.ndarray] = deque(maxlen=self.FLICKER_HISTORY)
        self._previous_gray: Optional[np.ndarray] = None

        self._fire_streak = 0
        self._smoke_streak = 0
        self._fire_emitted = False
        self._smoke_emitted = False
        self._peak_fire_ratio = 0.0
        self._peak_flicker = 0.0

        # Optional fine-tuned checkpoint. Loaded lazily and never fatal: if the
        # weights are broken we fall back to the heuristic rather than failing
        # the whole analysis.
        self.model_path = model_path
        self._model = None
        self._model_failed = False

    def set_fps(self, fps: float) -> None:
        self.fps = max(float(fps), 1.0)

    def reset(self) -> None:
        self._mask_history.clear()
        self._previous_gray = None
        self._fire_streak = 0
        self._smoke_streak = 0
        self._fire_emitted = False
        self._smoke_emitted = False
        self._peak_fire_ratio = 0.0
        self._peak_flicker = 0.0

    @property
    def uses_custom_model(self) -> bool:
        """True when a fine-tuned fire checkpoint is driving detection."""
        return bool(self.model_path) and not self._model_failed

    def _flicker_score(self, mask: np.ndarray) -> float:
        """Per-pixel change from the immediately previous mask, 0..1.

        A steady orange object produces an identical mask every frame and scores
        0. Flame edges move constantly and score well above the threshold. The
        immediately previous mask is the meaningful temporal comparison: an
        alternating flame boundary can match the mask from two frames ago, and
        averaging that zero-difference frame into the score incorrectly hides
        genuine flicker.
        """
        if not self._mask_history:
            return 0.0
        previous = self._mask_history[-1]
        active = float(max(np.count_nonzero(mask), np.count_nonzero(previous)))
        if active < 1.0:
            return 0.0
        changed = float(np.count_nonzero(cv2.absdiff(mask, previous)))
        return min(changed / active, 1.0)

    def _load_model(self):
        """Lazily load the optional fine-tuned checkpoint."""
        if self._model is not None or self._model_failed or not self.model_path:
            return self._model
        try:
            from ultralytics import YOLO

            self._model = YOLO(self.model_path)
        except Exception as exc:  # pragma: no cover - depends on user weights
            print(f"Warning: could not load FIRE_MODEL_PATH ({exc}); using heuristic.")
            self._model_failed = True
        return self._model

    def _model_detections(self, frame_bgr: np.ndarray) -> list[dict]:
        """Run the custom checkpoint, if configured. Returns [] otherwise."""
        model = self._load_model()
        if model is None:
            return []
        try:
            results = model.predict(source=frame_bgr, verbose=False, device="cpu", conf=0.35)
        except Exception as exc:  # pragma: no cover - depends on user weights
            print(f"Warning: fire model inference failed ({exc}); using heuristic.")
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
            class_id = int(box.cls.item()) if box.cls is not None else -1
            label = str(names.get(class_id, "")).lower()
            kind = "fire" if "fire" in label or "flame" in label else (
                "smoke" if "smoke" in label else ""
            )
            if not kind:
                continue
            out.append({
                "kind": kind,
                "bbox": (float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])),
                "confidence": float(box.conf.item()) if box.conf is not None else 0.0,
            })
        return out

    # -- Confidence calibration -------------------------------------------------
    #: Heuristic detection never claims model-grade certainty. This ceiling is
    #: deliberate and is surfaced to the operator in the risk breakdown.
    HEURISTIC_CONFIDENCE_CEILING = 0.92

    def _fire_confidence(self, area_ratio: float, flicker: float) -> float:
        area_component = min(area_ratio / (FIRE_MIN_AREA_RATIO * 6.0), 1.0)
        flicker_component = min(flicker / (FIRE_MIN_FLICKER_SCORE * 3.0), 1.0)
        raw = 0.40 + 0.30 * area_component + 0.25 * flicker_component
        return round(min(raw, self.HEURISTIC_CONFIDENCE_CEILING), 3)

    def _smoke_confidence(self, area_ratio: float) -> float:
        area_component = min(area_ratio / (SMOKE_MIN_AREA_RATIO * 5.0), 1.0)
        raw = 0.35 + 0.35 * area_component
        return round(min(raw, 0.80), 3)

    def _build_event(
        self,
        event_type: str,
        frame_number: int,
        confidence: float,
        persistence: float,
        context: float,
        explanation: str,
        bbox: Optional[tuple[int, int, int, int]],
        method: str,
    ) -> dict:
        seriousness = get_seriousness_for_event(event_type)
        risk = compute_risk_score(
            confidence=confidence,
            seriousness=seriousness,
            persistence=persistence,
            context=context,
        )
        return {
            "event_type": event_type,
            "track_id": -1,
            "frame": frame_number,
            "timestamp": frame_number / self.fps,
            "confidence": confidence,
            "risk_score": risk,
            "severity": get_severity(risk),
            "explanation": explanation,
            "seriousness": seriousness,
            "persistence": round(persistence, 3),
            "context": context,
            "bbox": bbox,
            "detection_method": method,
        }

    # -- Public entry point -----------------------------------------------------

    def process_frame(self, frame_bgr: np.ndarray, frame_number: int) -> list[dict]:
        """Analyse one *unannotated* frame and return any fire/smoke events.

        Returns at most one event per category for the lifetime of a contiguous
        detection: once "Fire Detected" has fired, it will not fire again until
        the fire signal disappears entirely. That keeps a 30-second burning-car
        clip from producing 200 near-identical incidents.
        """
        if frame_bgr is None or getattr(frame_bgr, "size", 0) == 0:
            return []
        if frame_bgr.ndim != 3 or frame_bgr.shape[2] != 3:
            return []

        height, width = frame_bgr.shape[:2]
        frame_area = float(width * height)
        if frame_area <= 0.0:
            return []

        # One custom-model pass serves both categories when weights are present.
        model_hits = self._model_detections(frame_bgr)

        events: list[dict] = []
        events.extend(self._step_fire(frame_bgr, frame_number, frame_area, model_hits))
        if ENABLE_SMOKE_DETECTION:
            events.extend(self._step_smoke(frame_bgr, frame_number, frame_area, model_hits))

        # Smoke needs the previous frame for its motion gate, so this update has
        # to happen after both steps have run.
        self._previous_gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        return events

    def _step_fire(
        self,
        frame_bgr: np.ndarray,
        frame_number: int,
        frame_area: float,
        model_hits: list[dict],
    ) -> list[dict]:
        mask = fire_mask(frame_bgr)
        area, mask_bbox = _largest_region(mask)
        area_ratio = area / frame_area

        # Flicker is measured against the history *before* this frame is added.
        flicker = self._flicker_score(mask)
        self._mask_history.append(mask)

        hits = [hit for hit in model_hits if hit["kind"] == "fire"]
        if hits:
            best = max(hits, key=lambda hit: hit["confidence"])
            detected = True
            confidence = round(min(best["confidence"], 0.99), 3)
            bbox = tuple(int(round(v)) for v in best["bbox"])
            method = "model"
        else:
            detected = (
                area_ratio >= FIRE_MIN_AREA_RATIO
                and flicker >= FIRE_MIN_FLICKER_SCORE
            )
            confidence = self._fire_confidence(area_ratio, flicker)
            bbox = mask_bbox
            method = "heuristic"

        if not detected:
            # Decay rather than reset: real flame masks drop below threshold for
            # the odd frame, and a hard reset would restart the whole streak.
            self._fire_streak = max(0, self._fire_streak - 1)
            if self._fire_streak == 0:
                self._fire_emitted = False
                self._peak_fire_ratio = 0.0
                self._peak_flicker = 0.0
            return []

        self._fire_streak += 1
        self._peak_fire_ratio = max(self._peak_fire_ratio, area_ratio)
        self._peak_flicker = max(self._peak_flicker, flicker)

        if self._fire_emitted or self._fire_streak < FIRE_PERSISTENCE_FRAMES:
            return []

        self._fire_emitted = True
        persistence = min(self._fire_streak / (FIRE_PERSISTENCE_FRAMES * 2.0), 1.0)
        seconds = self._fire_streak / self.fps
        if method == "model":
            explanation = (
                f"Fine-tuned fire model detected flame at {confidence:.0%} confidence, "
                f"sustained across {self._fire_streak} processed frames "
                f"(~{seconds:.1f}s of footage)."
            )
        else:
            explanation = (
                f"Flame-coloured region covering {self._peak_fire_ratio:.2%} of the frame, "
                f"red-dominant and flickering (score {self._peak_flicker:.2f} vs. "
                f"{FIRE_MIN_FLICKER_SCORE:.2f} required), sustained across "
                f"{self._fire_streak} processed frames (~{seconds:.1f}s). "
                "Heuristic colour + temporal analysis — verify before dispatch."
            )

        return [self._build_event(
            event_type="Fire Detected",
            frame_number=frame_number,
            confidence=confidence,
            persistence=persistence,
            context=0.8,
            explanation=explanation,
            bbox=bbox,
            method=method,
        )]

    def _step_smoke(
        self,
        frame_bgr: np.ndarray,
        frame_number: int,
        frame_area: float,
        model_hits: list[dict],
    ) -> list[dict]:
        mask = smoke_mask(frame_bgr, self._previous_gray)
        area, mask_bbox = _largest_region(mask)
        area_ratio = area / frame_area

        hits = [hit for hit in model_hits if hit["kind"] == "smoke"]
        if hits:
            best = max(hits, key=lambda hit: hit["confidence"])
            detected = True
            confidence = round(min(best["confidence"], 0.99), 3)
            bbox = tuple(int(round(v)) for v in best["bbox"])
            method = "model"
        else:
            detected = area_ratio >= SMOKE_MIN_AREA_RATIO
            confidence = self._smoke_confidence(area_ratio)
            bbox = mask_bbox
            method = "heuristic"

        if not detected:
            self._smoke_streak = max(0, self._smoke_streak - 1)
            if self._smoke_streak == 0:
                self._smoke_emitted = False
            return []

        self._smoke_streak += 1
        if self._smoke_emitted or self._smoke_streak < SMOKE_PERSISTENCE_FRAMES:
            return []

        self._smoke_emitted = True
        persistence = min(self._smoke_streak / (SMOKE_PERSISTENCE_FRAMES * 2.0), 1.0)
        seconds = self._smoke_streak / self.fps
        if method == "model":
            explanation = (
                f"Fine-tuned model detected smoke at {confidence:.0%} confidence, "
                f"sustained across {self._smoke_streak} processed frames "
                f"(~{seconds:.1f}s of footage)."
            )
        else:
            explanation = (
                f"Desaturated drifting region covering {area_ratio:.2%} of the frame "
                f"(motion-confirmed), sustained across {self._smoke_streak} processed "
                f"frames (~{seconds:.1f}s). Heuristic — haze, steam and dust share this "
                "signature, so operator verification is required."
            )

        return [self._build_event(
            event_type="Smoke Detected",
            frame_number=frame_number,
            confidence=confidence,
            persistence=persistence,
            context=0.6,
            explanation=explanation,
            bbox=bbox,
            method=method,
        )]

