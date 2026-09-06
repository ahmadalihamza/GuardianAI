"""End-to-end and integration tests for GuardianAI pipeline."""
import os
import uuid

import numpy as np
import pytest

from backend import database
from backend.event_detector import EventDetector
from backend.schemas import AnalyzeResponse, IncidentResponse, HealthResponse


def video_processor():
    """Import the video pipeline, skipping if its native deps are absent.

    `video_processor` pulls in OpenCV and Ultralytics. Guarding the import here
    rather than at module scope keeps the pure-Python tests below runnable on a
    machine that has neither.
    """
    pytest.importorskip("cv2", reason="video pipeline needs OpenCV")
    pytest.importorskip("ultralytics", reason="video pipeline needs Ultralytics")
    from backend import video_processor as module
    return module


@pytest.fixture()
def isolated_db(tmp_path, monkeypatch):
    """Redirect the database so a test run cannot pollute real incidents."""
    monkeypatch.setattr(database, "DATABASE_PATH", str(tmp_path / "pipeline.db"))
    database.init_database()


def test_detection_toggles_in_event_detector():
    """Verify that enable_intrusion=False and enable_fall=False suppress detections."""
    detector = EventDetector()
    detector.set_fps(30)
    zone_norm = (0.5, 0.2, 0.9, 0.9)
    frame_w, frame_h = 640, 480

    # Simulate person inside restricted zone with intrusion disabled
    detections = [{
        "track_id": 10,
        "bbox": (350, 150, 450, 400),
        "confidence": 0.9,
        "class_id": 0,
        "class_name": "person",
    }]

    # 40 frames inside zone but enable_intrusion=False
    events_disabled = []
    for i in range(40):
        evs = detector.process_frame(
            detections=detections,
            frame_number=i,
            zone_norm=zone_norm,
            frame_width=frame_w,
            frame_height=frame_h,
            enable_intrusion=False,
            enable_fall=True,
        )
        events_disabled.extend(evs)
    assert len(events_disabled) == 0, "Intrusion events should be suppressed when enable_intrusion=False"

    # Now enable intrusion on a fresh detector
    detector_enabled = EventDetector()
    detector_enabled.set_fps(30)
    events_enabled = []
    for i in range(40):
        evs = detector_enabled.process_frame(
            detections=detections,
            frame_number=i,
            zone_norm=zone_norm,
            frame_width=frame_w,
            frame_height=frame_h,
            enable_intrusion=True,
            enable_fall=True,
        )
        events_enabled.extend(evs)
    assert len(events_enabled) >= 1, "Intrusion event should trigger when enable_intrusion=True"
    assert any("Intrusion" in e["event_type"] for e in events_enabled)


def test_fall_toggle_in_event_detector():
    """Verify that enable_fall=False suppresses fall detections."""
    detector = EventDetector()
    detector.set_fps(30)
    zone_norm = (0.1, 0.1, 0.9, 0.9)
    frame_w, frame_h = 640, 480

    # Person upright first, then horizontal
    events_disabled = []
    for i in range(25):
        bbox = (250, 100, 310, 380) if i < 5 else (150, 280, 450, 380)
        detections = [{
            "track_id": 20,
            "bbox": bbox,
            "confidence": 0.85,
            "class_id": 0,
            "class_name": "person",
        }]
        evs = detector.process_frame(
            detections=detections,
            frame_number=i,
            zone_norm=zone_norm,
            frame_width=frame_w,
            frame_height=frame_h,
            enable_intrusion=True,
            enable_fall=False,
        )
        events_disabled.extend(evs)

    fall_events = [e for e in events_disabled if e["event_type"] == "Potential Fall"]
    assert len(fall_events) == 0, "Fall events should be suppressed when enable_fall=False"


def test_non_person_detections_are_ignored_by_person_logic():
    """A car parked in the restricted zone is not an intrusion."""
    detector = EventDetector()
    detector.set_fps(30)
    detections = [{
        "track_id": 30,
        "bbox": (350, 150, 450, 400),
        "confidence": 0.9,
        "class_id": 2,
        "class_name": "car",
    }]
    events = []
    for i in range(60):
        events.extend(detector.process_frame(
            detections=detections,
            frame_number=i,
            zone_norm=(0.5, 0.2, 0.9, 0.9),
            frame_width=640,
            frame_height=480,
        ))
    assert events == []


def test_save_evidence_frame():
    """Verify evidence snapshot is created properly."""
    module = video_processor()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    code = module.generate_incident_code()
    path = module.save_evidence_frame(frame, code)

    assert os.path.exists(path), f"Evidence frame should exist at {path}"
    assert os.path.getsize(path) > 0, "Evidence frame should not be empty"
    os.remove(path)


def test_database_crud_and_timestamps(isolated_db):
    """Verify database insert sets created_at and status updates work."""
    code = f"INC-TEST-{uuid.uuid4().hex[:8].upper()}"
    record = {
        "incident_code": code,
        "event_type": "Restricted Zone Intrusion",
        "source_video": "test.mp4",
        "camera_name": "Test Cam",
        "location": "North Wing",
        "person_track_id": 1,
        "video_timestamp": 2.5,
        "confidence": 0.92,
        "seriousness_score": 0.55,
        "persistence_score": 0.70,
        "context_score": 0.50,
        "risk_score": 72,
        "severity": "High",
        "explanation": "Test explanation",
        "ai_summary": "Test summary",
        "evidence_path": "data/evidence/test.jpg",
        "processed_video_path": "data/processed/test.mp4",
        "status": "Pending Verification",
    }
    inc_id = database.insert_incident(record)
    assert inc_id > 0
    assert "created_at" in record and record["created_at"] != ""
    assert "updated_at" in record and record["updated_at"] != ""

    # Fetch
    fetched = database.get_incident(inc_id)
    assert fetched is not None
    assert fetched["incident_code"] == code
    assert fetched["status"] == "Pending Verification"

    # Update status
    updated = database.update_incident_status(inc_id, "Verified")
    assert updated is True
    re_fetched = database.get_incident(inc_id)
    assert re_fetched["status"] == "Verified"

    # Statistics
    stats = database.get_statistics()
    assert stats["total_incidents"] >= 1
    assert stats["verified"] >= 1


def test_pydantic_schema_validation():
    """Verify schemas serialize and validate correctly."""
    inc = IncidentResponse(
        id=1,
        incident_code="INC-20260902-TEST",
        event_type="Potential Fall",
        camera_name="Cam 01",
        location="Zone B",
        person_track_id=3,
        video_timestamp=1.2,
        confidence=0.88,
        risk_score=85,
        severity="High",
        explanation="Person fell",
        ai_summary="AI detected fall",
        evidence_path="evidence/test.jpg",
        status="Pending Verification",
        created_at="2026-09-02T12:00:00",
    )
    assert inc.id == 1
    assert inc.severity == "High"

    resp = AnalyzeResponse(
        success=True,
        message="Done",
        people_tracked=2,
        incidents_created=1,
        incidents=[inc],
        processing_duration_seconds=1.45,
    )
    assert resp.success is True
    assert len(resp.incidents) == 1


def test_health_response_defaults():
    health = HealthResponse(status="healthy", model_loaded=True, database_connected=True)
    assert health.version == "1.0.0"
