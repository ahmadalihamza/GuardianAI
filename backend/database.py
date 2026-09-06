"""GuardianAI database module for SQLite operations."""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from backend.config import DATABASE_PATH
from backend.risk_engine import CRITICAL_EVENT_TYPES


def get_connection() -> sqlite3.Connection:
    """Create a new SQLite connection with row factory."""
    conn = sqlite3.connect(DATABASE_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


#: Columns added after the original schema shipped. `init_database` adds any
#: that are missing, so an existing `guardianai.db` keeps its incidents instead
#: of needing to be deleted and recreated.
_INCIDENT_MIGRATIONS: list[tuple[str, str]] = [
    ("reviewed_by", "TEXT"),
    ("reviewed_at", "TEXT"),
    ("review_notes", "TEXT"),
    ("operator_assessment", "TEXT"),
    ("escalated", "INTEGER DEFAULT 0"),
    ("detection_method", "TEXT"),
    ("bbox", "TEXT"),
]

#: Assessments an operator may record. "Unverifiable" exists because footage is
#: sometimes genuinely too poor to call either way, and forcing a reviewer to
#: guess between true and false positive corrupts the accuracy statistics.
REVIEW_ASSESSMENTS = ("True Positive", "False Positive", "Unverifiable")


def _migrate_incidents(conn: sqlite3.Connection) -> None:
    """Add any columns missing from an older `incidents` table."""
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(incidents)")}
    for column, ddl in _INCIDENT_MIGRATIONS:
        if column not in existing:
            conn.execute(f"ALTER TABLE incidents ADD COLUMN {column} {ddl}")


def init_database() -> None:
    """Initialize the database schema."""
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_code TEXT UNIQUE NOT NULL,
                event_type TEXT NOT NULL,
                source_video TEXT,
                camera_name TEXT,
                location TEXT,
                person_track_id INTEGER,
                video_timestamp REAL,
                confidence REAL,
                seriousness_score REAL,
                persistence_score REAL,
                context_score REAL,
                risk_score REAL,
                severity TEXT,
                explanation TEXT,
                ai_summary TEXT,
                evidence_path TEXT,
                processed_video_path TEXT,
                status TEXT DEFAULT 'Pending Verification',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                reviewed_by TEXT,
                reviewed_at TEXT,
                review_notes TEXT,
                operator_assessment TEXT,
                escalated INTEGER DEFAULT 0,
                detection_method TEXT,
                bbox TEXT
            )
        """)
        _migrate_incidents(conn)

        # Append-only audit trail. Rows are never updated or deleted, so the
        # review history of an incident is reconstructable even after its status
        # has changed several times.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS incident_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id INTEGER NOT NULL,
                reviewer TEXT NOT NULL,
                previous_status TEXT,
                new_status TEXT,
                assessment TEXT,
                notes TEXT,
                escalated INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_reviews_incident
            ON incident_reviews(incident_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_incidents_status
            ON incidents(status)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_incidents_event_type
            ON incidents(event_type)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_incidents_severity
            ON incidents(severity)
        """)
        conn.commit()
    finally:
        conn.close()


def insert_incident(incident: dict) -> int:
    """Insert an incident record and return its ID."""
    conn = get_connection()
    now = datetime.now(timezone.utc).isoformat()
    incident["created_at"] = incident.get("created_at") or now
    incident["updated_at"] = incident.get("updated_at") or now
    # Newer columns are optional for callers, so fill them in rather than
    # requiring every caller to know the full column list.
    incident.setdefault("detection_method", None)
    incident.setdefault("bbox", None)
    try:
        cursor = conn.execute("""
            INSERT INTO incidents (
                incident_code, event_type, source_video, camera_name, location,
                person_track_id, video_timestamp, confidence, seriousness_score,
                persistence_score, context_score, risk_score, severity,
                explanation, ai_summary, evidence_path, processed_video_path,
                status, created_at, updated_at, detection_method, bbox
            ) VALUES (
                :incident_code, :event_type, :source_video, :camera_name, :location,
                :person_track_id, :video_timestamp, :confidence, :seriousness_score,
                :persistence_score, :context_score, :risk_score, :severity,
                :explanation, :ai_summary, :evidence_path, :processed_video_path,
                :status, :created_at, :updated_at, :detection_method, :bbox
            )
        """, incident)
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_incident(incident_id: int) -> Optional[dict]:
    """Retrieve a single incident by ID."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM incidents WHERE id = ?",
            (incident_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_incidents(
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    location: Optional[str] = None,
    limit: int = 200
) -> list[dict]:
    """List incidents with optional filters."""
    conn = get_connection()
    query = "SELECT * FROM incidents WHERE 1=1"
    params: list = []
    if event_type:
        query += " AND event_type = ?"
        params.append(event_type)
    if severity:
        query += " AND severity = ?"
        params.append(severity)
    if status:
        query += " AND status = ?"
        params.append(status)
    if location:
        query += " AND location LIKE ?"
        params.append(f"%{location}%")
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    try:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def update_incident_status(incident_id: int, new_status: str) -> bool:
    """Update the status of an incident."""
    conn = get_connection()
    now = datetime.now(timezone.utc).isoformat()
    try:
        cursor = conn.execute(
            "UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?",
            (new_status, now, incident_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def record_review(
    incident_id: int,
    reviewer: str,
    new_status: Optional[str] = None,
    assessment: Optional[str] = None,
    notes: Optional[str] = None,
    escalated: bool = False,
) -> Optional[dict]:
    """Record an operator review and return the updated incident.

    Writes the audit row and the incident update in a single transaction: a
    review that changed the status but left no trail (or the reverse) would make
    the audit log untrustworthy, which defeats its purpose.

    Returns None when the incident does not exist.
    """
    conn = get_connection()
    now = datetime.now(timezone.utc).isoformat()
    try:
        row = conn.execute(
            "SELECT status FROM incidents WHERE id = ?", (incident_id,)
        ).fetchone()
        if row is None:
            return None
        previous_status = row["status"]
        target_status = new_status or previous_status

        with conn:
            conn.execute(
                """
                INSERT INTO incident_reviews (
                    incident_id, reviewer, previous_status, new_status,
                    assessment, notes, escalated, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    incident_id, reviewer, previous_status, target_status,
                    assessment, notes, 1 if escalated else 0, now,
                ),
            )
            conn.execute(
                """
                UPDATE incidents SET
                    status = ?, reviewed_by = ?, reviewed_at = ?,
                    review_notes = ?, operator_assessment = ?,
                    escalated = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    target_status, reviewer, now, notes, assessment,
                    1 if escalated else 0, now, incident_id,
                ),
            )

        updated = conn.execute(
            "SELECT * FROM incidents WHERE id = ?", (incident_id,)
        ).fetchone()
        return dict(updated) if updated else None
    finally:
        conn.close()


def list_reviews(incident_id: int) -> list[dict]:
    """Full review history for one incident, oldest first."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT * FROM incident_reviews
            WHERE incident_id = ?
            ORDER BY created_at ASC, id ASC
            """,
            (incident_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_statistics() -> dict:
    """Get dashboard statistics."""
    conn = get_connection()
    try:
        total = conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0]
        pending = conn.execute(
            "SELECT COUNT(*) FROM incidents WHERE status = 'Pending Verification'"
        ).fetchone()[0]
        verified = conn.execute(
            "SELECT COUNT(*) FROM incidents WHERE status = 'Verified'"
        ).fetchone()[0]
        high_risk = conn.execute(
            "SELECT COUNT(*) FROM incidents WHERE severity = 'High'"
        ).fetchone()[0]
        event_types = conn.execute(
            "SELECT event_type, COUNT(*) as count FROM incidents GROUP BY event_type"
        ).fetchall()
        severities = conn.execute(
            "SELECT severity, COUNT(*) as count FROM incidents GROUP BY severity"
        ).fetchall()

        # --- Reviewer analytics ------------------------------------------------
        # These are the numbers that tell an operator whether to trust the
        # detector: how much of the queue has actually been looked at, and what
        # share of reviewed incidents turned out to be nothing.
        assessments = {
            row["operator_assessment"]: row["count"]
            for row in conn.execute(
                """
                SELECT operator_assessment, COUNT(*) as count FROM incidents
                WHERE operator_assessment IS NOT NULL AND operator_assessment != ''
                GROUP BY operator_assessment
                """
            ).fetchall()
        }
        true_positives = assessments.get("True Positive", 0)
        false_positives = assessments.get("False Positive", 0)
        judged = true_positives + false_positives
        false_positive_rate = round(false_positives / judged, 4) if judged else None

        reviewed = conn.execute(
            "SELECT COUNT(*) FROM incidents WHERE reviewed_at IS NOT NULL"
        ).fetchone()[0]
        mean_seconds = conn.execute(
            """
            SELECT AVG((julianday(reviewed_at) - julianday(created_at)) * 86400.0)
            FROM incidents WHERE reviewed_at IS NOT NULL
            """
        ).fetchone()[0]

        critical_pending = 0
        if CRITICAL_EVENT_TYPES:
            placeholders = ",".join("?" for _ in CRITICAL_EVENT_TYPES)
            critical_pending = conn.execute(
                f"""
                SELECT COUNT(*) FROM incidents
                WHERE status = 'Pending Verification'
                  AND event_type IN ({placeholders})
                """,
                tuple(CRITICAL_EVENT_TYPES),
            ).fetchone()[0]

        return {
            "total_incidents": total,
            "pending_verification": pending,
            "verified": verified,
            "high_risk": high_risk,
            "event_type_distribution": {r["event_type"]: r["count"] for r in event_types},
            "severity_distribution": {r["severity"]: r["count"] for r in severities},
            "reviewed_count": reviewed,
            "critical_pending": critical_pending,
            "assessment_distribution": assessments,
            "false_positive_rate": false_positive_rate,
            "mean_seconds_to_review": (
                round(mean_seconds, 1) if mean_seconds is not None else None
            ),
        }
    finally:
        conn.close()
