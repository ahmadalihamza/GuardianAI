"""Traffic-accident detection for GuardianAI.

Unlike fire and firearms, this needs no extra weights at all: COCO already gives
us `car`, `motorcycle`, `bus`, `truck`, `bicycle` and `person`, and ByteTrack
gives each one a stable ID. An accident is then a statement about *kinematics*,
which is something a tracker can answer directly.

Four signatures are detected, in descending order of how confidently a camera
alone can establish them:

1. **Vehicle-Pedestrian Collision.** A person box overlapping a *moving* motor
   vehicle. The motion requirement is what separates an impact from a pedestrian
   standing beside a parked car.
2. **Vehicle Collision.** Two motor-vehicle tracks whose boxes overlap by at
   least `ACCIDENT_CONTACT_IOU` while at least one of them was moving. Bicycles
   are excluded because a cyclist filtering past a car overlaps constantly.
3. **Vehicle Overturn.** A vehicle whose aspect ratio grows by
   `ACCIDENT_OVERTURN_RATIO_DELTA` relative to its own established baseline
   *and* which has stopped moving. Relative change is essential: a car seen from
   the side already has a ratio near 2.0, so no absolute threshold can work.
4. **Sudden Vehicle Stop.** A vehicle that lost `ACCIDENT_DECEL_RATIO` of its
   speed within `ACCIDENT_DECEL_WINDOW_SECONDS`. This is the weakest signal — a
   normal stop at a red light looks the same — so it carries the lowest
   seriousness of the four and exists mainly as a review prompt.

All speeds are expressed in **box-widths per second**, not pixels per second.
That makes every threshold scale-invariant: a car crossing its own width in a
second is doing the same thing whether it fills the frame or sits at the far end
of the street, whereas a pixel threshold would need retuning per camera.
"""
from collections import deque
from typing import Optional

from backend import coco_classes
from backend.config import (
    ACCIDENT_CONTACT_IOU,
    ACCIDENT_DECEL_RATIO,
    ACCIDENT_DECEL_WINDOW_SECONDS,
    ACCIDENT_MIN_SPEED,
    ACCIDENT_OVERTURN_RATIO_DELTA,
    ACCIDENT_PERSISTENCE_FRAMES,
    INCIDENT_COOLDOWN_SECONDS,
)
from backend.risk_engine import (
    compute_risk_score,
    get_seriousness_for_event,
    get_severity,
)

#: Trailing samples kept per track. Enough to cover 2× the deceleration window
#: at any realistic frame-skip setting.
_HISTORY = 40

#: Samples required before the aspect-ratio baseline is considered established.
_BASELINE_SAMPLES = 5


def iou(
    box_a: tuple[float, float, float, float],
    box_b: tuple[float, float, float, float],
) -> float:
    """Intersection over union of two xyxy boxes."""
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = ix2 - ix1, iy2 - iy1
    if iw <= 0.0 or ih <= 0.0:
        return 0.0
    intersection = iw * ih
    area_a = max(ax2 - ax1, 0.0) * max(ay2 - ay1, 0.0)
    area_b = max(bx2 - bx1, 0.0) * max(by2 - by1, 0.0)
    union = area_a + area_b - intersection
    if union <= 0.0:
        return 0.0
    return float(intersection / union)


def union_box(
    box_a: tuple[float, float, float, float],
    box_b: tuple[float, float, float, float],
) -> tuple[int, int, int, int]:
    """Smallest box containing both inputs — used to frame a collision."""
    return (
        int(round(min(box_a[0], box_b[0]))),
        int(round(min(box_a[1], box_b[1]))),
        int(round(max(box_a[2], box_b[2]))),
        int(round(max(box_a[3], box_b[3]))),
    )


class VehicleState:
    """Trailing kinematics for one tracked object."""

    def __init__(self, track_id: int, class_id: int):
        self.track_id = track_id
        self.class_id = class_id
        self.samples: deque[dict] = deque(maxlen=_HISTORY)
        self.confidences: deque[float] = deque(maxlen=_HISTORY)
        self.last_seen_frame = -9999

        self.reference_ratio: float = 0.0
        #: Trailing speed samples, in box-widths/second. A window rather than a
        #: lifetime peak: "was moving" has to mean *recently*, or a car that
        #: drove past ten seconds ago would still count as moving while parked.
        self.speed_window: deque[float] = deque(maxlen=15)

        self.stop_streak = 0
        self.overturn_streak = 0
        self.stop_reported_frame = -9999
        self.overturn_reported_frame = -9999

    def observe(
        self,
        bbox: tuple[float, float, float, float],
        confidence: float,
        frame_number: int,
        timestamp: float,
    ) -> None:
        x1, y1, x2, y2 = bbox
        width = max(x2 - x1, 1.0)
        height = max(y2 - y1, 1.0)
        self.samples.append({
            "ts": timestamp,
            "cx": (x1 + x2) / 2.0,
            "cy": (y1 + y2) / 2.0,
            "width": width,
            "height": height,
            "ratio": width / height,
            "bbox": bbox,
        })
        self.confidences.append(float(confidence))
        self.last_seen_frame = frame_number

        # The baseline is the mean ratio over the track's first few observations,
        # i.e. what this vehicle looks like when it is the right way up.
        if len(self.samples) <= _BASELINE_SAMPLES:
            ratios = [s["ratio"] for s in self.samples]
            self.reference_ratio = sum(ratios) / len(ratios)

        speed = self.speed_now()
        if speed is not None:
            self.speed_window.append(speed)

    @property
    def latest_speed(self) -> Optional[float]:
        return self.speed_window[-1] if self.speed_window else None

    @property
    def recent_peak_speed(self) -> float:
        return max(self.speed_window) if self.speed_window else 0.0

    @property
    def was_moving(self) -> bool:
        """True when this track has been genuinely mobile in the recent past."""
        return self.recent_peak_speed >= ACCIDENT_MIN_SPEED

    @property
    def mean_confidence(self) -> float:
        if not self.confidences:
            return 0.0
        return float(sum(self.confidences) / len(self.confidences))

    def _sample_at(self, target_ts: float) -> Optional[dict]:
        """Sample whose timestamp is closest to `target_ts`."""
        best: Optional[dict] = None
        best_delta: Optional[float] = None
        for sample in self.samples:
            delta = abs(sample["ts"] - target_ts)
            if best_delta is None or delta < best_delta:
                best, best_delta = sample, delta
        return best

    @staticmethod
    def _speed(start: dict, end: dict) -> Optional[float]:
        """Speed between two samples in box-widths per second."""
        dt = end["ts"] - start["ts"]
        if dt <= 1e-6:
            return None
        dx = end["cx"] - start["cx"]
        dy = end["cy"] - start["cy"]
        width = max((start["width"] + end["width"]) / 2.0, 1.0)
        return float(((dx * dx + dy * dy) ** 0.5) / dt / width)

    def speed_now(self, window: float = ACCIDENT_DECEL_WINDOW_SECONDS) -> Optional[float]:
        """Speed over the trailing `window` seconds."""
        if len(self.samples) < 2:
            return None
        latest = self.samples[-1]
        earlier = self._sample_at(latest["ts"] - window)
        if earlier is None or earlier is latest:
            return None
        return self._speed(earlier, latest)

    def deceleration(self) -> Optional[tuple[float, float]]:
        """`(prior_speed, current_speed)` across two adjacent windows.

        Returns None until the track has enough history to cover both windows,
        which prevents a freshly-acquired track from reporting a phantom stop.
        """
        if len(self.samples) < 3:
            return None
        window = ACCIDENT_DECEL_WINDOW_SECONDS
        latest = self.samples[-1]
        mid = self._sample_at(latest["ts"] - window)
        past = self._sample_at(latest["ts"] - 2.0 * window)
        if mid is None or past is None:
            return None
        if latest["ts"] - past["ts"] < window * 1.5:
            return None
        current = self._speed(mid, latest)
        prior = self._speed(past, mid)
        if current is None or prior is None:
            return None
        return prior, current

    @property
    def ratio_growth(self) -> float:
        """How much wider-than-tall the box has become vs. its own baseline."""
        if not self.samples or self.reference_ratio <= 0.0:
            return 0.0
        return float(self.samples[-1]["ratio"] / self.reference_ratio - 1.0)

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        return self.samples[-1]["bbox"] if self.samples else (0.0, 0.0, 0.0, 0.0)


class PairState:
    """Contact state for one ordered pair of track IDs."""

    def __init__(self) -> None:
        self.contact_streak = 0
        self.reported_frame = -9999
        self.last_seen_frame = -9999
        self.peak_iou = 0.0


class AccidentDetector:
    """Stateful per-video traffic-accident detector.

    One instance per video. `process_frame` consumes the same detection list the
    rest of the pipeline already has, so no extra inference happens here.
    """

    def __init__(self) -> None:
        self.fps: float = 30.0
        self.states: dict[int, VehicleState] = {}
        self.pairs: dict[tuple[int, int], PairState] = {}

    def set_fps(self, fps: float) -> None:
        self.fps = max(float(fps), 1.0)

    def reset(self) -> None:
        self.states.clear()
        self.pairs.clear()

    def _get_state(self, track_id: int, class_id: int) -> VehicleState:
        state = self.states.get(track_id)
        if state is None:
            state = VehicleState(track_id, class_id)
            self.states[track_id] = state
        return state

    def _get_pair(self, key: tuple[int, int]) -> PairState:
        pair = self.pairs.get(key)
        if pair is None:
            pair = PairState()
            self.pairs[key] = pair
        return pair

    def _cooled(self, last_frame: int, frame_number: int) -> bool:
        return frame_number - last_frame > self.fps * INCIDENT_COOLDOWN_SECONDS

    def process_frame(self, detections: list[dict], frame_number: int) -> list[dict]:
        """Return any new traffic-accident events for this frame."""
        timestamp = frame_number / self.fps
        vehicles: dict[int, VehicleState] = {}
        people: dict[int, dict] = {}

        for det in detections:
            track_id = int(det.get("track_id", -1))
            if track_id < 0:
                continue
            class_id = int(det.get("class_id", -1))
            bbox = tuple(float(v) for v in det["bbox"])
            confidence = float(det.get("confidence", 0.0))
            if coco_classes.is_vehicle(class_id):
                state = self._get_state(track_id, class_id)
                state.observe(bbox, confidence, frame_number, timestamp)
                vehicles[track_id] = state
            elif class_id == coco_classes.PERSON:
                people[track_id] = {"bbox": bbox, "confidence": confidence}

        events: list[dict] = []
        # Most serious first, and pedestrian impacts suppress the redundant
        # "sudden stop" that the same braking event would otherwise produce.
        events.extend(self._check_pedestrian_contacts(vehicles, people, frame_number))
        events.extend(self._check_vehicle_contacts(vehicles, frame_number))
        for state in vehicles.values():
            events.extend(self._check_kinematics(state, frame_number))

        self._expire(frame_number)
        return events

    def _check_pedestrian_contacts(
        self,
        vehicles: dict[int, VehicleState],
        people: dict[int, dict],
        frame_number: int,
    ) -> list[dict]:
        events: list[dict] = []
        for vehicle_id, state in vehicles.items():
            if not coco_classes.is_motor_vehicle(state.class_id):
                continue
            for person_id, person in people.items():
                overlap = iou(state.bbox, person["bbox"])
                key = (-person_id - 1, vehicle_id)  # person IDs kept distinct
                pair = self._get_pair(key)
                pair.last_seen_frame = frame_number

                if overlap < ACCIDENT_CONTACT_IOU or not state.was_moving:
                    pair.contact_streak = max(0, pair.contact_streak - 1)
                    continue

                pair.contact_streak += 1
                pair.peak_iou = max(pair.peak_iou, overlap)
                if pair.contact_streak < ACCIDENT_PERSISTENCE_FRAMES:
                    continue
                if not self._cooled(pair.reported_frame, frame_number):
                    continue

                pair.reported_frame = frame_number
                # The braking that follows an impact is the same event, so don't
                # also raise a "Sudden Vehicle Stop" for this vehicle.
                state.stop_reported_frame = frame_number
                confidence = round(
                    min((state.mean_confidence + person["confidence"]) / 2.0, 1.0), 3
                )
                events.append(self._build_event(
                    event_type="Vehicle-Pedestrian Collision",
                    frame_number=frame_number,
                    track_id=person_id,
                    confidence=confidence,
                    persistence=min(
                        pair.contact_streak / (ACCIDENT_PERSISTENCE_FRAMES * 3.0), 1.0
                    ),
                    context=0.9,
                    bbox=union_box(state.bbox, person["bbox"]),
                    explanation=(
                        f"Person #{person_id} overlapped moving "
                        f"{coco_classes.class_name(state.class_id)} #{vehicle_id} by "
                        f"{pair.peak_iou:.0%} for {pair.contact_streak} processed frames "
                        f"while the vehicle was travelling at "
                        f"{state.recent_peak_speed:.2f} vehicle-widths/second."
                    ),
                ))
        return events

    def _check_vehicle_contacts(
        self,
        vehicles: dict[int, VehicleState],
        frame_number: int,
    ) -> list[dict]:
        events: list[dict] = []
        motor = [
            (track_id, state) for track_id, state in vehicles.items()
            if coco_classes.is_motor_vehicle(state.class_id)
        ]
        for index, (id_a, state_a) in enumerate(motor):
            for id_b, state_b in motor[index + 1:]:
                overlap = iou(state_a.bbox, state_b.bbox)
                key = (min(id_a, id_b), max(id_a, id_b))
                pair = self._get_pair(key)
                pair.last_seen_frame = frame_number

                # At least one party must have been moving. Two parked cars whose
                # boxes overlap because of camera perspective are not a collision.
                if overlap < ACCIDENT_CONTACT_IOU or not (
                    state_a.was_moving or state_b.was_moving
                ):
                    pair.contact_streak = max(0, pair.contact_streak - 1)
                    continue

                pair.contact_streak += 1
                pair.peak_iou = max(pair.peak_iou, overlap)
                if pair.contact_streak < ACCIDENT_PERSISTENCE_FRAMES:
                    continue
                if not self._cooled(pair.reported_frame, frame_number):
                    continue

                pair.reported_frame = frame_number
                state_a.stop_reported_frame = frame_number
                state_b.stop_reported_frame = frame_number
                faster = max(state_a.recent_peak_speed, state_b.recent_peak_speed)
                events.append(self._build_event(
                    event_type="Vehicle Collision",
                    frame_number=frame_number,
                    track_id=id_a,
                    confidence=round(
                        min((state_a.mean_confidence + state_b.mean_confidence) / 2.0, 1.0), 3
                    ),
                    persistence=min(
                        pair.contact_streak / (ACCIDENT_PERSISTENCE_FRAMES * 3.0), 1.0
                    ),
                    context=0.8,
                    bbox=union_box(state_a.bbox, state_b.bbox),
                    explanation=(
                        f"{coco_classes.class_name(state_a.class_id).capitalize()} #{id_a} and "
                        f"{coco_classes.class_name(state_b.class_id)} #{id_b} overlapped by "
                        f"{pair.peak_iou:.0%} across {pair.contact_streak} processed frames, "
                        f"with a closing speed of {faster:.2f} vehicle-widths/second."
                    ),
                ))
        return events

    def _check_kinematics(self, state: VehicleState, frame_number: int) -> list[dict]:
        events: list[dict] = []
        name = coco_classes.class_name(state.class_id)
        speed = state.latest_speed or 0.0

        # --- Overturn -----------------------------------------------------------
        # A vehicle that has rolled is both much wider relative to its own
        # baseline *and* stationary. Requiring both rejects cars turning corners.
        growth = state.ratio_growth
        if (
            len(state.samples) > _BASELINE_SAMPLES
            and growth >= ACCIDENT_OVERTURN_RATIO_DELTA
            and speed < ACCIDENT_MIN_SPEED
            and state.was_moving
        ):
            state.overturn_streak += 1
        else:
            state.overturn_streak = max(0, state.overturn_streak - 1)

        if (
            state.overturn_streak >= ACCIDENT_PERSISTENCE_FRAMES
            and self._cooled(state.overturn_reported_frame, frame_number)
        ):
            state.overturn_reported_frame = frame_number
            events.append(self._build_event(
                event_type="Vehicle Overturn",
                frame_number=frame_number,
                track_id=state.track_id,
                confidence=round(min(state.mean_confidence, 1.0), 3),
                persistence=min(
                    state.overturn_streak / (ACCIDENT_PERSISTENCE_FRAMES * 3.0), 1.0
                ),
                context=0.85,
                bbox=tuple(int(round(v)) for v in state.bbox),
                explanation=(
                    f"{name.capitalize()} #{state.track_id} became {growth:.0%} wider "
                    f"relative to its own upright baseline and has come to a stop after "
                    f"travelling at up to {state.recent_peak_speed:.2f} "
                    "vehicle-widths/second, which is consistent with a rollover."
                ),
            ))

        events.extend(self._check_sudden_stop(state, frame_number, name))
        return events

    def _check_sudden_stop(
        self,
        state: VehicleState,
        frame_number: int,
        name: str,
    ) -> list[dict]:
        decel = state.deceleration()
        if decel is None:
            return []
        prior, current = decel
        lost_enough = prior >= ACCIDENT_MIN_SPEED and current <= prior * (
            1.0 - ACCIDENT_DECEL_RATIO
        )
        if not lost_enough:
            state.stop_streak = max(0, state.stop_streak - 1)
            return []

        state.stop_streak += 1
        if state.stop_streak < ACCIDENT_PERSISTENCE_FRAMES:
            return []
        if not self._cooled(state.stop_reported_frame, frame_number):
            return []

        state.stop_reported_frame = frame_number
        drop = 1.0 - (current / prior) if prior > 0 else 1.0
        return [self._build_event(
            event_type="Sudden Vehicle Stop",
            frame_number=frame_number,
            track_id=state.track_id,
            confidence=round(min(state.mean_confidence, 1.0), 3),
            persistence=min(state.stop_streak / (ACCIDENT_PERSISTENCE_FRAMES * 3.0), 1.0),
            context=0.5,
            bbox=tuple(int(round(v)) for v in state.bbox),
            explanation=(
                f"{name.capitalize()} #{state.track_id} lost {drop:.0%} of its speed "
                f"within {ACCIDENT_DECEL_WINDOW_SECONDS:.1f}s "
                f"({prior:.2f} → {current:.2f} vehicle-widths/second). Hard braking is "
                "also normal at junctions, so this is a review prompt rather than a "
                "confirmed accident."
            ),
        )]

    def _build_event(
        self,
        event_type: str,
        frame_number: int,
        track_id: int,
        confidence: float,
        persistence: float,
        context: float,
        bbox: tuple[int, int, int, int],
        explanation: str,
    ) -> dict:
        seriousness = get_seriousness_for_event(event_type)
        confidence = round(min(max(confidence, 0.0), 1.0), 3)
        risk = compute_risk_score(
            confidence=confidence,
            seriousness=seriousness,
            persistence=persistence,
            context=context,
        )
        return {
            "event_type": event_type,
            "track_id": track_id,
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
            "detection_method": "kinematic",
        }

    def _expire(self, frame_number: int) -> None:
        """Drop tracks and pairs that have not been seen for two cooldowns."""
        horizon = self.fps * INCIDENT_COOLDOWN_SECONDS * 2
        for track_id in [
            key for key, state in self.states.items()
            if frame_number - state.last_seen_frame > horizon
        ]:
            del self.states[track_id]
        for key in [
            key for key, pair in self.pairs.items()
            if frame_number - pair.last_seen_frame > horizon
        ]:
            del self.pairs[key]
