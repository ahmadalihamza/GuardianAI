"""Tests for the operator verification workflow and its audit trail.

The audit table is append-only: rows are never updated or deleted. That is the
property worth testing, because it is what makes an incident's review history
reconstructable after its status has changed several times — and what makes the
false-positive rate a number an operator can act on.
"""
import pytest

from backend import database


@pytest.fixture()
def db(tmp_path, monkeypatch):
    """Point the database module at a throwaway file for one test."""
    path = tmp_path / "guardian_test.db"
    monkeypatch.setattr(database, "DATABASE_PATH", str(path))
    database.init_database()
    return path


def make_incident(code: str, event_type: str = "Potential Fall", **overrides) -> int:
    record = {
        "incident_code": code,
        "event_type": event_type,
        "source_video": "clip.mp4",
        "camera_name": "Cam 01",
        "location": "Main Entrance",
        "person_track_id": 3,
        "video_timestamp": 4.5,
        "confidence": 0.81,
        "seriousness_score": 0.85,
        "persistence_score": 0.5,
        "context_score": 0.6,
        "risk_score": 72,
        "severity": "High",
        "explanation": "posture changed",
        "ai_summary": "summary",
        "evidence_path": "",
        "processed_video_path": "",
        "status": "Pending Verification",
    }
    record.update(overrides)
    return database.insert_incident(record)


def test_new_columns_are_written_and_read_back(db):
    inc_id = make_incident(
        "INC-A", detection_method="kinematic", bbox="1.0,2.0,3.0,4.0",
    )
    row = database.get_incident(inc_id)
    assert row["detection_method"] == "kinematic"
    assert row["bbox"] == "1.0,2.0,3.0,4.0"


def test_detection_method_and_bbox_are_optional(db):
    """Existing callers do not know about the newer columns."""
    row = database.get_incident(make_incident("INC-B"))
    assert row["detection_method"] is None
    assert row["bbox"] is None


def test_review_updates_incident_and_writes_one_audit_row(db):
    inc_id = make_incident("INC-C")
    updated = database.record_review(
        inc_id, "alice", new_status="Verified",
        assessment="True Positive", notes="clear on camera", escalated=True,
    )
    assert updated["status"] == "Verified"
    assert updated["reviewed_by"] == "alice"
    assert updated["operator_assessment"] == "True Positive"
    assert updated["review_notes"] == "clear on camera"
    assert updated["escalated"] == 1
    assert updated["reviewed_at"]

    rows = database.list_reviews(inc_id)
    assert len(rows) == 1
    assert rows[0]["previous_status"] == "Pending Verification"
    assert rows[0]["new_status"] == "Verified"
    assert rows[0]["reviewer"] == "alice"


def test_history_is_append_only_and_chains_statuses(db):
    inc_id = make_incident("INC-D")
    database.record_review(inc_id, "alice", "Verified", "True Positive")
    database.record_review(inc_id, "bob", "Resolved", "True Positive", "handled")

    rows = database.list_reviews(inc_id)
    assert [r["reviewer"] for r in rows] == ["alice", "bob"]
    assert [r["previous_status"] for r in rows] == ["Pending Verification", "Verified"]
    assert [r["new_status"] for r in rows] == ["Verified", "Resolved"]
    # The first review survives verbatim even though the status moved on.
    assert database.get_incident(inc_id)["status"] == "Resolved"


def test_review_without_a_status_keeps_the_current_one(db):
    inc_id = make_incident("INC-E")
    updated = database.record_review(inc_id, "alice", assessment="Unverifiable")
    assert updated["status"] == "Pending Verification"
    assert database.list_reviews(inc_id)[0]["new_status"] == "Pending Verification"


def test_review_of_a_missing_incident_returns_none(db):
    assert database.record_review(9999, "alice", "Verified") is None
    assert database.list_reviews(9999) == []


def test_unverifiable_is_excluded_from_the_false_positive_rate(db):
    """Forcing a guess on unreadable footage would corrupt the statistics."""
    database.record_review(make_incident("INC-F"), "a", "Verified", "True Positive")
    database.record_review(make_incident("INC-G"), "a", "Dismissed", "False Positive")
    database.record_review(make_incident("INC-H"), "a", "Dismissed", "False Positive")
    database.record_review(make_incident("INC-I"), "a", None, "Unverifiable")

    stats = database.get_statistics()
    assert stats["reviewed_count"] == 4
    assert stats["assessment_distribution"]["Unverifiable"] == 1
    # Stored to 4 decimal places: two of the three *judged* incidents were false.
    assert stats["false_positive_rate"] == round(2 / 3, 4)


def test_false_positive_rate_is_none_before_anything_is_judged(db):
    make_incident("INC-J")
    stats = database.get_statistics()
    assert stats["false_positive_rate"] is None
    assert stats["mean_seconds_to_review"] is None
    assert stats["reviewed_count"] == 0


def test_repeated_reviews_of_one_incident_are_counted_once(db):
    """`assessment_distribution` counts incidents, not review rows."""
    inc_id = make_incident("INC-K")
    database.record_review(inc_id, "alice", "Verified", "True Positive")
    database.record_review(inc_id, "bob", "Dismissed", "False Positive")

    stats = database.get_statistics()
    assert len(database.list_reviews(inc_id)) == 2
    assert stats["assessment_distribution"] == {"False Positive": 1}
    assert stats["false_positive_rate"] == 1.0


def test_critical_pending_counts_only_severe_event_types(db):
    make_incident("INC-L", event_type="Fire Detected")
    make_incident("INC-M", event_type="Restricted Zone Intrusion")
    assert database.get_statistics()["critical_pending"] == 1


def test_init_database_is_idempotent(db):
    inc_id = make_incident("INC-N")
    database.init_database()
    database.init_database()
    assert database.get_incident(inc_id)["incident_code"] == "INC-N"


def test_migration_adds_columns_to_a_legacy_table(tmp_path, monkeypatch):
    """An existing guardianai.db must keep its incidents, not be recreated."""
    import sqlite3

    path = tmp_path / "legacy.db"
    conn = sqlite3.connect(path)
    conn.execute(
        """
        CREATE TABLE incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_code TEXT UNIQUE NOT NULL,
            event_type TEXT NOT NULL,
            source_video TEXT, camera_name TEXT, location TEXT,
            person_track_id INTEGER, video_timestamp REAL, confidence REAL,
            seriousness_score REAL, persistence_score REAL, context_score REAL,
            risk_score REAL, severity TEXT, explanation TEXT, ai_summary TEXT,
            evidence_path TEXT, processed_video_path TEXT, status TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "INSERT INTO incidents (incident_code, event_type, status, created_at, updated_at)"
        " VALUES ('INC-OLD', 'Potential Fall', 'Verified', '2026-01-01', '2026-01-01')"
    )
    conn.commit()
    conn.close()

    monkeypatch.setattr(database, "DATABASE_PATH", str(path))
    database.init_database()

    rows = database.list_incidents()
    assert [r["incident_code"] for r in rows] == ["INC-OLD"]
    for column, _ddl in database._INCIDENT_MIGRATIONS:
        assert column in rows[0]
    # And the migrated table accepts a review.
    assert database.record_review(rows[0]["id"], "alice", "Resolved") is not None
