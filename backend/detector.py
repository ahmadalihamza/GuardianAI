"""GuardianAI object detection and tracking on top of YOLO11.

Every enabled feature (intrusion, falls, weapons, traffic accidents) reads from
a *single* `model.track()` call per frame. That matters for two reasons:

1. **Accuracy.** ByteTrack keeps internal state keyed on the model instance. If
   one call asked for `classes=[0]` and the next asked for `classes=[2,7]`, the
   tracker would see people vanish and reappear every other frame and would keep
   re-issuing track IDs. Requesting the union once keeps IDs stable.
2. **Speed.** Inference dominates the frame budget. Three passes over the same
   frame costs three times as much for no extra information.

Detections are returned as plain dicts so the event detectors stay free of any
Ultralytics types, which also keeps them unit-testable without the model.
"""
from typing import Iterable, Optional, Sequence

import numpy as np
from ultralytics import YOLO

from backend import coco_classes
from backend.config import YOLO_MODEL_PATH

_model: Optional[YOLO] = None

#: Per-class confidence floors. YOLO's small classes (knife, scissors) score
#: lower than people do, so a single global threshold either floods the log with
#: false weapons or misses real ones. Anything not listed uses the call's
#: `confidence_threshold`.
CLASS_CONFIDENCE_FLOORS: dict[int, float] = {
    coco_classes.KNIFE: 0.30,
    coco_classes.SCISSORS: 0.35,
    coco_classes.BASEBALL_BAT: 0.35,
}


def load_model() -> YOLO:
    """Load the YOLO11n model (singleton)."""
    global _model
    if _model is None:
        _model = YOLO(YOLO_MODEL_PATH)
    return _model


def reset_tracker() -> None:
    """Drop ByteTrack state so a new video starts from track ID 1.

    Without this, track IDs keep climbing across videos in a long-lived server
    process and the "people tracked" count for a fresh upload is polluted by the
    previous one.
    """
    model = _model
    if model is None:
        return
    for predictor_attr in ("predictor",):
        predictor = getattr(model, predictor_attr, None)
        trackers = getattr(predictor, "trackers", None) if predictor else None
        if not trackers:
            continue
        for tracker in trackers:
            reset = getattr(tracker, "reset", None)
            if callable(reset):
                reset()


def detect_objects(
    frame: np.ndarray,
    classes: Optional[Sequence[int]] = None,
    confidence_threshold: float = 0.35,
) -> list[dict]:
    """Detect and track objects of interest in a single frame.

    Args:
        frame: BGR image.
        classes: COCO class ids to request. Defaults to everything GuardianAI
            knows how to reason about (people, vehicles, weapon proxies).
        confidence_threshold: Default floor; per-class floors in
            `CLASS_CONFIDENCE_FLOORS` take precedence when higher.

    Returns:
        A list of dicts with keys `track_id`, `bbox` (x1, y1, x2, y2),
        `confidence`, `class_id` and `class_name`. `track_id` is -1 when the
        tracker could not assign one, and callers are expected to skip those.
    """
    requested = tuple(classes) if classes is not None else coco_classes.ALL_TRACKED_CLASSES
    if not requested:
        return []

    model = load_model()
    results = model.track(
        source=frame,
        persist=True,
        classes=list(requested),
        conf=confidence_threshold,
        verbose=False,
        device="cpu",
    )

    if not results:
        return []

    boxes = results[0].boxes
    if boxes is None or len(boxes) == 0:
        return []

    names = getattr(results[0], "names", None) or {}
    detections: list[dict] = []

    for i in range(len(boxes)):
        box = boxes[i]
        xyxy = box.xyxy.cpu().numpy().flatten()
        if len(xyxy) < 4:
            continue

        class_id = int(box.cls.item()) if box.cls is not None else -1
        confidence = float(box.conf.item()) if box.conf is not None else 0.0

        floor = CLASS_CONFIDENCE_FLOORS.get(class_id, confidence_threshold)
        if confidence < floor:
            continue

        detections.append({
            "track_id": int(box.id.item()) if box.id is not None else -1,
            "bbox": (float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])),
            "confidence": confidence,
            "class_id": class_id,
            "class_name": names.get(class_id) or coco_classes.class_name(class_id),
        })

    return detections


def split_by_class(
    detections: Iterable[dict],
    class_ids: Sequence[int],
) -> list[dict]:
    """Filter an already-detected list down to the given COCO classes."""
    wanted = set(class_ids)
    return [d for d in detections if d.get("class_id") in wanted]


def detect_people(frame: np.ndarray, confidence_threshold: float = 0.45) -> list[dict]:
    """Detect people only.

    Retained for callers that genuinely want a person-only pass (and for the
    existing test suite). The full pipeline uses `detect_objects` instead so
    that one inference serves every feature.
    """
    return detect_objects(
        frame,
        classes=[coco_classes.PERSON],
        confidence_threshold=confidence_threshold,
    )


def is_model_loaded() -> bool:
    """Check if the model is loaded."""
    return _model is not None
