"""Tests for GuardianAI event detector."""
import pytest
from backend.event_detector import EventDetector, TrackState


def test_point_in_zone_inside():
    zone = (100, 100, 300, 300)
    assert EventDetector.point_in_zone(200, 200, zone) is True


def test_point_in_zone_outside():
    zone = (100, 100, 300, 300)
    assert EventDetector.point_in_zone(50, 50, zone) is False


def test_point_in_zone_on_edge():
    zone = (100, 100, 300, 300)
    assert EventDetector.point_in_zone(100, 100, zone) is True


def test_point_in_zone_reversed_coords():
    """Zone with x1 > x2 should still work."""
    zone = (300, 300, 100, 100)
    assert EventDetector.point_in_zone(200, 200, zone) is True


def test_track_state_initial():
    state = TrackState(track_id=1)
    assert state.track_id == 1
    assert state.zone_entry_frame is None
    assert state.zone_persistence_count == 0
    assert state.zone_incident_created is False
    assert state.fall_incident_created is False


def test_normal_walking_no_zone():
    """Person walking outside zone should not trigger intrusion."""
    detector = EventDetector()
    detector.set_fps(30)

    zone_norm = (0.6, 0.3, 0.9, 0.8)
    frame_w, frame_h = 640, 480

    for i in range(30):
        detections = [{
            "track_id": 1,
            "bbox": (50, 50, 150, 350),
            "confidence": 0.9,
            "class_id": 0,
            "class_name": "person",
        }]
        events = detector.process_frame(detections, i, zone_norm, frame_w, frame_h)
        assert len(events) == 0


def test_zone_intrusion_single_incident():
    """Person entering zone should create exactly one incident."""
    detector = EventDetector()
    detector.set_fps(30)

    zone_norm = (0.6, 0.3, 0.9, 0.8)
    frame_w, frame_h = 640, 480

    all_events = []
    for i in range(60):
        detections = [{
            "track_id": 2,
            "bbox": (420, 180, 540, 370),
            "confidence": 0.85,
            "class_id": 0,
            "class_name": "person",
        }]
        events = detector.process_frame(detections, i, zone_norm, frame_w, frame_h)
        all_events.extend(events)

    assert len(all_events) >= 1
    assert all_events[0]["event_type"] in ("Restricted Zone Intrusion", "Extended Intrusion")
    intrusion_events = [e for e in all_events if "Intrusion" in e["event_type"]]
    assert len(intrusion_events) == 1


def test_fall_detection():
    """Person transitioning to horizontal posture should trigger Potential Fall."""
    detector = EventDetector()
    detector.set_fps(30)

    zone_norm = (0.6, 0.3, 0.9, 0.8)
    frame_w, frame_h = 640, 480

    all_events = []
    for i in range(20):
        if i < 5:
            bbox = (250, 100, 310, 380)
        else:
            bbox = (150, 280, 450, 380)
        detections = [{
            "track_id": 3,
            "bbox": bbox,
            "confidence": 0.8,
            "class_id": 0,
            "class_name": "person",
        }]
        events = detector.process_frame(detections, i, zone_norm, frame_w, frame_h)
        all_events.extend(events)

    fall_events = [e for e in all_events if e["event_type"] == "Potential Fall"]
    assert len(fall_events) >= 1


def test_no_people_no_crash():
    """Empty detections should not crash."""
    detector = EventDetector()
    detector.set_fps(30)

    zone_norm = (0.6, 0.3, 0.9, 0.8)
    frame_w, frame_h = 640, 480

    for i in range(10):
        events = detector.process_frame([], i, zone_norm, frame_w, frame_h)
        assert len(events) == 0


def test_cooldown_prevents_duplicate():
    """Same track should not create multiple incidents without leaving zone."""
    detector = EventDetector()
    detector.set_fps(30)

    zone_norm = (0.6, 0.3, 0.9, 0.8)
    frame_w, frame_h = 640, 480

    all_events = []
    for i in range(120):
        detections = [{
            "track_id": 5,
            "bbox": (420, 180, 540, 370),
            "confidence": 0.85,
            "class_id": 0,
            "class_name": "person",
        }]
        events = detector.process_frame(detections, i, zone_norm, frame_w, frame_h)
        all_events.extend(events)

    intrusion_events = [e for e in all_events if "Intrusion" in e["event_type"]]
    assert len(intrusion_events) == 1


def test_fall_persistence_required():
    """Fall should not trigger on a single horizontal frame."""
    detector = EventDetector()
    detector.set_fps(30)

    zone_norm = (0.6, 0.3, 0.9, 0.8)
    frame_w, frame_h = 640, 480

    all_events = []
    for i in range(3):
        bbox = (180, 280, 420, 320)
        detections = [{
            "track_id": 7,
            "bbox": bbox,
            "confidence": 0.8,
            "class_id": 0,
            "class_name": "person",
        }]
        events = detector.process_frame(detections, i, zone_norm, frame_w, frame_h)
        all_events.extend(events)

    fall_events = [e for e in all_events if e["event_type"] == "Potential Fall"]
    assert len(fall_events) == 0
