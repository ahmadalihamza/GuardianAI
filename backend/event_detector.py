"""Event detection module for restricted-zone intrusion and potential falls.

Two accuracy guards apply to every event raised here:

* **Track age.** A box that has only just been acquired has an unstable shape and
  an unreliable class, so a track must be observed `MIN_TRACK_AGE_FRAMES` times
  before it may raise anything. This costs a fraction of a second of latency and
  removes most single-frame false positives.
* **Smoothed confidence.** The confidence attached to an incident is the mean
  over the track's last `CONFIDENCE_SMOOTHING_WINDOW` observations, not a
  lifetime average and not the instantaneous value. A lifetime average is
  dominated by frames from seconds ago; an instantaneous value swings by 0.2
  between adjacent frames.
* **Fresh posture reference.** A fall is a *transition*, so the upright reference
  a horizontal box is compared against must be recent. Without that bound,
  someone who stands still for a minute and then crouches presents the same
  geometry as someone who falls.
"""
from collections import deque
from typing import Deque, Dict, List, Optional, Tuple

from backend.coco_classes import PERSON
from backend.config import (
    ZONE_PERSISTENCE_FRAMES,
    FALL_PERSISTENCE_FRAMES,
    FALL_RATIO_THRESHOLD,
    FALL_VERTICAL_SPEED_THRESHOLD,
    FALL_MIN_HEIGHT_DROP,
    INCIDENT_COOLDOWN_SECONDS,
    CONFIDENCE_SMOOTHING_WINDOW,
    MIN_TRACK_AGE_FRAMES,
)
from backend.risk_engine import (
    compute_risk_score,
    get_severity,
    get_seriousness_for_event,
)

#: Seconds within which the upright reference must have been seen for a
#: horizontal box to count as a fall rather than a slow, deliberate movement.
FALL_REFERENCE_MAX_AGE_SECONDS = 2.0


class TrackState:
    """Per-track state for event detection."""

    def __init__(self, track_id: int):
        self.track_id = track_id
        self.zone_entry_frame: Optional[int] = None
        self.zone_persistence_count: int = 0
        self.zone_total_confidence: float = 0.0
        self.zone_sample_count: int = 0
        self.zone_incident_created: bool = False
        self.last_zone_incident_frame: int = -9999

        self.bbox_history: List[Dict] = []
        self.fall_horizontal_count: int = 0
        self.fall_incident_created: bool = False
        self.last_fall_incident_frame: int = -9999
        self.upright_reference_height: float = 0.0
        self.upright_reference_cy: float = 0.0
        self.upright_reference_ts: float = -1e9

        #: Last observed box, carried onto the event so the UI and the video
        #: overlay can frame the incident without re-running detection.
        self.last_bbox: Optional[Tuple[float, float, float, float]] = None

        #: Rolling confidence window. See the module docstring for why this is
        #: preferred over `zone_total_confidence / zone_sample_count`.
        self.recent_confidences: Deque[float] = deque(
            maxlen=max(CONFIDENCE_SMOOTHING_WINDOW, 1)
        )

    @property
    def observations(self) -> int:
        """How many frames this track has been seen in."""
        return self.zone_sample_count

    @property
    def is_established(self) -> bool:
        """True once the track is old enough to be allowed to raise an event."""
        return self.zone_sample_count >= MIN_TRACK_AGE_FRAMES

    @property
    def smoothed_confidence(self) -> float:
        """Mean detection confidence over the recent window."""
        if self.recent_confidences:
            return float(sum(self.recent_confidences) / len(self.recent_confidences))
        if self.zone_sample_count:
            return self.zone_total_confidence / self.zone_sample_count
        return 0.0

    def update_bbox_history(self, width: float, height: float, cx: float, cy: float, ratio: float, ts: float):
        self.bbox_history.append({
            "width": width,
            "height": height,
            "cx": cx,
            "cy": cy,
            "ratio": ratio,
            "ts": ts,
        })
        if len(self.bbox_history) > 20:
            self.bbox_history = self.bbox_history[-20:]


class EventDetector:
    """Detects restricted-zone intrusions and potential falls."""

    def __init__(self):
        self.track_states: Dict[int, TrackState] = {}
        self.frame_counter: int = 0
        self.fps: float = 30.0

    def reset(self):
        self.track_states.clear()
        self.frame_counter = 0

    def set_fps(self, fps: float):
        self.fps = max(fps, 1.0)

    def _get_state(self, track_id: int) -> TrackState:
        if track_id not in self.track_states:
            self.track_states[track_id] = TrackState(track_id)
        return self.track_states[track_id]

    @staticmethod
    def point_in_zone(px: float, py: float, zone: Tuple[float, float, float, float]) -> bool:
        """Check if a point (in frame coords) is inside the zone rectangle."""
        zx1, zy1, zx2, zy2 = zone
        min_x, max_x = min(zx1, zx2), max(zx1, zx2)
        min_y, max_y = min(zy1, zy2), max(zy1, zy2)
        return min_x <= px <= max_x and min_y <= py <= max_y

    def process_frame(
        self,
        detections: List[dict],
        frame_number: int,
        zone_norm: Tuple[float, float, float, float],
        frame_width: int,
        frame_height: int,
        zone_sensitivity: float = 0.5,
        enable_intrusion: bool = True,
        enable_fall: bool = True,
    ) -> List[dict]:
        """Process detections for one frame and return any new events."""
        self.frame_counter = frame_number
        new_events: List[dict] = []

        zone_px = (
            zone_norm[0] * frame_width,
            zone_norm[1] * frame_height,
            zone_norm[2] * frame_width,
            zone_norm[3] * frame_height,
        )

        for det in detections:
            track_id = det.get("track_id", -1)
            if track_id < 0:
                continue
            # The pipeline now runs one multi-class inference per frame, so
            # vehicles and weapons arrive here too. Zone and fall logic is about
            # people only. Absent class_id means a person-only caller.
            if det.get("class_id", PERSON) != PERSON:
                continue
            state = self._get_state(track_id)
            x1, y1, x2, y2 = det["bbox"]
            conf = det["confidence"]
            cx = (x1 + x2) / 2.0
            cy_bottom = y2
            w = max(x2 - x1, 1.0)
            h = max(y2 - y1, 1.0)
            ratio = w / h

            ts = frame_number / self.fps
            state.update_bbox_history(w, h, cx, cy_bottom, ratio, ts)
            state.zone_total_confidence += conf
            state.zone_sample_count += 1
            state.recent_confidences.append(float(conf))
            state.last_bbox = (float(x1), float(y1), float(x2), float(y2))

            if enable_intrusion:
                self._check_zone(track_id, state, cx, cy_bottom, zone_px, zone_sensitivity, frame_number, new_events)
            if enable_fall:
                self._check_fall(track_id, state, frame_number, new_events)

        return new_events

    def _check_zone(
        self,
        track_id: int,
        state: TrackState,
        cx: float,
        cy_bottom: float,
        zone_px: Tuple[float, float, float, float],
        zone_sensitivity: float,
        frame_number: int,
        new_events: List[dict],
    ):
        inside = self.point_in_zone(cx, cy_bottom, zone_px)
        if inside:
            if state.zone_entry_frame is None:
                state.zone_entry_frame = frame_number
            state.zone_persistence_count += 1

            if not state.zone_incident_created:
                threshold = max(3, int(ZONE_PERSISTENCE_FRAMES * (1.1 - zone_sensitivity)))
                if state.zone_persistence_count >= threshold and state.is_established:
                    avg_conf = state.smoothed_confidence
                    persistence_score = min(state.zone_persistence_count / (threshold * 2), 1.0)
                    seriousness = get_seriousness_for_event("Restricted Zone Intrusion")
                    if state.zone_persistence_count >= threshold * 2:
                        seriousness = get_seriousness_for_event("Extended Intrusion")
                        event_type = "Extended Intrusion"
                    else:
                        event_type = "Restricted Zone Intrusion"
                    risk = compute_risk_score(
                        confidence=avg_conf,
                        seriousness=seriousness,
                        persistence=persistence_score,
                        context=zone_sensitivity,
                    )
                    severity = get_severity(risk)
                    duration = state.zone_persistence_count / self.fps
                    explanation = (
                        f"Person #{track_id} remained inside the restricted zone for "
                        f"{duration:.1f} seconds with a mean detection confidence of "
                        f"{avg_conf*100:.0f}% over the last "
                        f"{len(state.recent_confidences)} observations."
                    )
                    new_events.append({
                        "event_type": event_type,
                        "track_id": track_id,
                        "frame": frame_number,
                        "timestamp": frame_number / self.fps,
                        "confidence": avg_conf,
                        "risk_score": risk,
                        "severity": severity,
                        "explanation": explanation,
                        "seriousness": seriousness,
                        "persistence": persistence_score,
                        "context": zone_sensitivity,
                        "bbox": state.last_bbox,
                        "detection_method": "coco",
                    })
                    state.zone_incident_created = True
                    state.last_zone_incident_frame = frame_number
        else:
            state.zone_entry_frame = None
            state.zone_persistence_count = 0
            if frame_number - state.last_zone_incident_frame > self.fps * INCIDENT_COOLDOWN_SECONDS:
                state.zone_incident_created = False

    def _check_fall(
        self,
        track_id: int,
        state: TrackState,
        frame_number: int,
        new_events: List[dict],
    ):
        if state.fall_incident_created:
            if frame_number - state.last_fall_incident_frame > self.fps * INCIDENT_COOLDOWN_SECONDS:
                state.fall_incident_created = False
                state.fall_horizontal_count = 0
            return

        history = state.bbox_history
        if len(history) < 3 or not state.is_established:
            return

        current = history[-1]
        ratio_now = current["ratio"]
        height_now = current["height"]
        cy_now = current["cy"]
        ts_now = current["ts"]

        is_upright = ratio_now < 1.0
        is_horizontal = ratio_now >= FALL_RATIO_THRESHOLD

        if is_upright:
            state.upright_reference_height = height_now
            state.upright_reference_cy = cy_now
            state.upright_reference_ts = ts_now
            state.fall_horizontal_count = max(0, state.fall_horizontal_count - 1)
            return

        if state.upright_reference_height <= 0:
            return

        # A fall is a transition, so the reference posture has to be recent. A
        # stale reference turns any slow crouch or sit-down into a "fall".
        if ts_now - state.upright_reference_ts > FALL_REFERENCE_MAX_AGE_SECONDS:
            state.fall_horizontal_count = max(0, state.fall_horizontal_count - 1)
            return

        height_drop = (state.upright_reference_height - height_now) / max(state.upright_reference_height, 1.0)
        vertical_drop = (cy_now - state.upright_reference_cy) / max(state.upright_reference_height, 1.0)

        is_dropping = vertical_drop > FALL_VERTICAL_SPEED_THRESHOLD
        is_shrinking = height_drop > FALL_MIN_HEIGHT_DROP

        if is_horizontal and (is_dropping or is_shrinking):
            state.fall_horizontal_count += 1
            if state.fall_horizontal_count >= FALL_PERSISTENCE_FRAMES:
                avg_conf = state.smoothed_confidence
                persistence_score = min(state.fall_horizontal_count / (FALL_PERSISTENCE_FRAMES * 2), 1.0)
                seriousness = get_seriousness_for_event("Potential Fall")
                risk = compute_risk_score(
                    confidence=avg_conf,
                    seriousness=seriousness,
                    persistence=persistence_score,
                    context=0.6,
                )
                severity = get_severity(risk)
                duration = state.fall_horizontal_count / self.fps
                elapsed = ts_now - state.upright_reference_ts
                explanation = (
                    f"Person #{track_id}'s posture changed from upright to horizontal "
                    f"within {elapsed:.1f}s and stayed there for {duration:.1f} seconds. "
                    f"Bounding-box width-to-height ratio reached {ratio_now:.2f} "
                    f"(threshold {FALL_RATIO_THRESHOLD:.2f})."
                )
                new_events.append({
                    "event_type": "Potential Fall",
                    "track_id": track_id,
                    "frame": frame_number,
                    "timestamp": frame_number / self.fps,
                    "confidence": avg_conf,
                    "risk_score": risk,
                    "severity": severity,
                    "explanation": explanation,
                    "seriousness": seriousness,
                    "persistence": persistence_score,
                    "context": 0.6,
                    "bbox": state.last_bbox,
                    "detection_method": "coco",
                })
                state.fall_incident_created = True
                state.last_fall_incident_frame = frame_number
        else:
            state.fall_horizontal_count = max(0, state.fall_horizontal_count - 1)
