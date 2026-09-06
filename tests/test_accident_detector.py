"""Tests for the traffic accident detector.

Every threshold in `accident_detector` is expressed in box-widths per second
rather than pixels per frame, so these scenarios are written the same way: a
"moving" vehicle here would still be moving if the camera were twice as far
away. The negative scenarios (parked cars that merely overlap, a vehicle
cruising at constant speed) are the ones that keep the incident queue credible.
"""
import pytest

from backend import coco_classes
from backend.accident_detector import AccidentDetector, iou, union_box

FPS = 30.0


def vehicle(track_id: int, cx: float, cy: float, w: float = 100.0, h: float = 60.0,
            class_id: int = coco_classes.CAR, conf: float = 0.85) -> dict:
    return {
        "track_id": track_id,
        "bbox": (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2),
        "confidence": conf,
        "class_id": class_id,
        "class_name": coco_classes.class_name(class_id),
    }


def pedestrian(track_id: int, cx: float, cy: float) -> dict:
    return {
        "track_id": track_id,
        "bbox": (cx - 20, cy - 50, cx + 20, cy + 50),
        "confidence": 0.90,
        "class_id": coco_classes.PERSON,
        "class_name": "person",
    }


def run(frames: list[list[dict]]) -> list[dict]:
    detector = AccidentDetector()
    detector.set_fps(FPS)
    events: list[dict] = []
    for frame_number, detections in enumerate(frames):
        events.extend(detector.process_frame(detections, frame_number))
    return events


def types(events: list[dict]) -> list[str]:
    return [e["event_type"] for e in events]


def test_iou_and_union_helpers():
    assert iou((0, 0, 10, 10), (0, 0, 10, 10)) == 1.0
    assert iou((0, 0, 10, 10), (50, 50, 60, 60)) == 0.0
    assert iou((0, 0, 10, 10), (5, 0, 15, 10)) == pytest.approx(1 / 3)
    assert union_box((0, 0, 10, 10), (5, 5, 20, 20)) == (0, 0, 20, 20)


def test_vehicle_pedestrian_collision():
    """A moving car whose box overlaps a standing person is the top signature."""
    frames = []
    for i in range(45):                       # approach, 8 px/frame
        frames.append([vehicle(1, 50 + i * 8, 300), pedestrian(2, 400, 290)])
    for _ in range(60):                       # stopped after impact
        frames.append([vehicle(1, 50 + 44 * 8, 300), pedestrian(2, 400, 290)])

    events = run(frames)
    assert "Vehicle-Pedestrian Collision" in types(events)
    hit = next(e for e in events if e["event_type"] == "Vehicle-Pedestrian Collision")
    assert hit["severity"] == "High"
    assert hit["detection_method"] == "kinematic"
    assert hit["bbox"] is not None


def test_collision_suppresses_its_own_braking_report():
    """The stop that follows an impact is the impact, not a separate incident."""
    frames = []
    for i in range(45):
        frames.append([vehicle(1, 50 + i * 8, 300), pedestrian(2, 400, 290)])
    for _ in range(90):
        frames.append([vehicle(1, 50 + 44 * 8, 300), pedestrian(2, 400, 290)])

    reported = types(run(frames))
    assert "Vehicle-Pedestrian Collision" in reported
    assert "Sudden Vehicle Stop" not in reported, reported


def test_vehicle_to_vehicle_collision():
    frames = []
    for i in range(50):
        frames.append([vehicle(1, 50 + i * 8, 300), vehicle(2, 460, 300)])
    for _ in range(30):
        frames.append([vehicle(1, 50 + 49 * 8, 300), vehicle(2, 460, 300)])

    assert "Vehicle Collision" in types(run(frames))


def test_two_parked_overlapping_cars_raise_nothing():
    """Overlap without motion is occlusion or a tight car park, not a crash."""
    frames = [[vehicle(1, 300, 300), vehicle(2, 340, 305)] for _ in range(90)]
    assert run(frames) == []


def test_constant_speed_traffic_raises_nothing():
    frames = [[vehicle(1, 20 + i * 4, 300)] for i in range(100)]
    assert run(frames) == []


def test_sudden_stop_is_reported_as_a_review_prompt():
    frames = [[vehicle(1, 20 + i * 8, 300)] for i in range(45)]
    frames += [[vehicle(1, 20 + 44 * 8, 300)] for _ in range(45)]

    events = run(frames)
    assert types(events) == ["Sudden Vehicle Stop"], types(events)
    assert events[0]["severity"] in ("Low", "Medium")
    assert "review prompt" in events[0]["explanation"]


def test_overturned_vehicle():
    """A box that widens sharply and then stops moving reads as a rollover."""
    frames = [[vehicle(1, 20 + i * 8, 300)] for i in range(35)]
    stopped_x = 20 + 34 * 8
    frames += [[vehicle(1, stopped_x, 300, w=145.0, h=48.0)] for _ in range(45)]

    reported = types(run(frames))
    assert "Vehicle Overturn" in reported, reported


def test_untracked_boxes_are_skipped():
    frames = [[vehicle(-1, 20 + i * 8, 300)] for i in range(60)]
    assert run(frames) == []


def test_reset_clears_state():
    detector = AccidentDetector()
    detector.set_fps(FPS)
    for i in range(30):
        detector.process_frame([vehicle(1, 20 + i * 8, 300)], i)
    assert detector.states
    detector.reset()
    assert not detector.states and not detector.pairs
