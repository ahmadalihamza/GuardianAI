import asyncio
from contextlib import asynccontextmanager
import shutil
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend import database
from backend.config import (
    EVIDENCE_DIR,
    PROCESSED_DIR,
    UPLOAD_DIR,
)
from backend.detector import is_model_loaded, load_model
from backend.report_generator import get_incident_summary
from backend.schemas import (
    AnalyzeResponse,
    HealthResponse,
    IncidentResponse,
    IncidentReviewResponse,
    ReviewRequest,
    StatisticsResponse,
    StatusUpdateRequest,
)
from backend.video_processor import (
    generate_incident_code,
    process_video,
    save_evidence_frame,
)
from backend import utils


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and load model on startup."""
    utils.ensure_directories()
    database.init_database()
    try:
        load_model()
    except Exception as e:
        print(f"Warning: Could not load YOLO model on startup: {e}")
    yield


app = FastAPI(title="GuardianAI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/processed", StaticFiles(directory=str(PROCESSED_DIR)), name="processed")
app.mount("/evidence", StaticFiles(directory=str(EVIDENCE_DIR)), name="evidence")


@app.get("/health", response_model=HealthResponse)
def health_check():
    """Health check endpoint."""
    db_ok = False
    try:
        conn = database.get_connection()
        conn.execute("SELECT 1")
        conn.close()
        db_ok = True
    except Exception:
        pass
    return HealthResponse(
        status="healthy",
        model_loaded=is_model_loaded(),
        database_connected=db_ok,
    )


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_video(
    video: UploadFile = File(...),
    camera_name: str = Form("Camera 01"),
    location: str = Form("Main Entrance"),
    zone_x1: float = Form(0.6),
    zone_y1: float = Form(0.3),
    zone_x2: float = Form(0.9),
    zone_y2: float = Form(0.8),
    zone_sensitivity: float = Form(0.5),
    enable_intrusion: bool = Form(True),
    enable_fall_detection: bool = Form(True),
    enable_fire_detection: bool = Form(False),
    enable_weapon_detection: bool = Form(False),
    enable_accident_detection: bool = Form(False),
):
    """Analyze a video for dangerous events."""
    start_time = time.time()

    if not video.filename:
        raise HTTPException(status_code=400, detail="No video file provided")

    allowed_extensions = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    raw_name = Path(video.filename).name
    ext = Path(raw_name).suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(allowed_extensions)}",
        )

    safe_stem = "".join(c for c in Path(raw_name).stem if c.isalnum() or c in "._- ") or "video"
    unique_name = f"{uuid.uuid4().hex}_{safe_stem}{ext}"
    upload_path = str(UPLOAD_DIR / unique_name)

    try:
        with open(upload_path, "wb") as f:
            shutil.copyfileobj(video.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")
    finally:
        await video.close()

    zone_norm = (zone_x1, zone_y1, zone_x2, zone_y2)

    created_incidents = []
    evidence_frames = {}

    def on_event(event, frame=None):
        incident_code = event.get("incident_code") or generate_incident_code()
        event["incident_code"] = incident_code
        if frame is not None and not event.get("evidence_path"):
            saved_path = save_evidence_frame(frame, incident_code)
            event["evidence_path"] = saved_path
            evidence_frames[incident_code] = saved_path
        elif incident_code not in evidence_frames:
            evidence_frames[incident_code] = event.get("evidence_path", "")

    result = await asyncio.to_thread(
        process_video,
        video_path=upload_path,
        zone_norm=zone_norm,
        enable_intrusion=enable_intrusion,
        enable_fall=enable_fall_detection,
        zone_sensitivity=zone_sensitivity,
        on_event_callback=on_event,
        enable_fire=enable_fire_detection,
        enable_weapon=enable_weapon_detection,
        enable_accident=enable_accident_detection,
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=422,
            detail=result.get("error", "Video processing failed"),
        )

    for event in result.get("events", []):
        incident_code = event["incident_code"]
        summary = get_incident_summary(
            event_type=event["event_type"],
            timestamp=event["timestamp"],
            track_id=event["track_id"],
            camera_name=camera_name,
            location=location,
            risk_score=event["risk_score"],
            severity=event["severity"],
            explanation=event["explanation"],
        )
        evidence_path = event.get("evidence_path") or evidence_frames.get(incident_code, "")

        # Stored as a plain "x1,y1,x2,y2" string: SQLite has no array type and
        # the UI only ever needs to draw it back onto the evidence still.
        raw_bbox = event.get("bbox")
        bbox_text = (
            ",".join(f"{float(v):.1f}" for v in raw_bbox)
            if raw_bbox else None
        )

        incident_record = {
            "incident_code": incident_code,
            "event_type": event["event_type"],
            "source_video": raw_name,
            "camera_name": camera_name,
            "location": location,
            "person_track_id": event["track_id"],
            "video_timestamp": event["timestamp"],
            "confidence": event["confidence"],
            "seriousness_score": event["seriousness"],
            "persistence_score": event["persistence"],
            "context_score": event["context"],
            "risk_score": event["risk_score"],
            "severity": event["severity"],
            "explanation": event["explanation"],
            "ai_summary": summary,
            "evidence_path": evidence_path,
            "processed_video_path": result["output_path"],
            "status": "Pending Verification",
            "detection_method": event.get("detection_method"),
            "bbox": bbox_text,
        }
        incident_id = database.insert_incident(incident_record)
        incident_record["id"] = incident_id
        created_incidents.append(incident_record)

    duration = time.time() - start_time

    processed_filename = Path(result["output_path"]).name
    processed_url = f"/processed/{processed_filename}"

    return AnalyzeResponse(
        success=True,
        message=f"Analysis complete. {len(created_incidents)} incident(s) detected.",
        processed_video_path=result["output_path"],
        processed_video_url=processed_url,
        people_tracked=result["people_tracked"],
        vehicles_tracked=result.get("vehicles_tracked", 0),
        incidents_created=len(created_incidents),
        features=result.get("features", {}),
        custom_models=result.get("custom_models", {}),
        incidents=[
            IncidentResponse(
                id=inc["id"],
                incident_code=inc["incident_code"],
                event_type=inc["event_type"],
                camera_name=inc["camera_name"],
                location=inc["location"],
                person_track_id=inc["person_track_id"],
                video_timestamp=inc["video_timestamp"],
                confidence=inc["confidence"],
                risk_score=inc["risk_score"],
                severity=inc["severity"],
                explanation=inc["explanation"],
                ai_summary=inc["ai_summary"],
                evidence_path=inc["evidence_path"],
                status=inc["status"],
                created_at=inc.get("created_at", ""),
                detection_method=inc.get("detection_method"),
                bbox=inc.get("bbox"),
            )
            for inc in created_incidents
        ],
        processing_duration_seconds=round(duration, 2),
    )


@app.get("/api/incidents")
def list_incidents(
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    location: Optional[str] = None,
):
    """List incidents with optional filters."""
    return database.list_incidents(
        event_type=event_type,
        severity=severity,
        status=status,
        location=location,
    )


@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id: int):
    """Get a single incident by ID, with its full review history."""
    incident = database.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident["reviews"] = database.list_reviews(incident_id)
    return incident


#: Statuses an operator may set. `Pending Verification` is included so a review
#: can explicitly hand an incident back to the queue.
ALLOWED_STATUSES = ("Pending Verification", "Verified", "Dismissed", "Resolved")


@app.patch("/api/incidents/{incident_id}/status")
def update_status(incident_id: int, body: StatusUpdateRequest):
    """Update incident status."""
    if body.status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(ALLOWED_STATUSES)}",
        )
    updated = database.update_incident_status(incident_id, body.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"success": True, "status": body.status}


@app.post("/api/incidents/{incident_id}/review")
def review_incident(incident_id: int, body: ReviewRequest):
    """Record an operator's verification of an incident.

    Writes an append-only audit row alongside the incident update, so the review
    history survives later status changes.
    """
    reviewer = body.reviewer.strip()
    if not reviewer:
        raise HTTPException(status_code=400, detail="Reviewer name is required")
    if body.status is not None and body.status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(ALLOWED_STATUSES)}",
        )
    if body.assessment is not None and body.assessment not in database.REVIEW_ASSESSMENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid assessment. Allowed: {', '.join(database.REVIEW_ASSESSMENTS)}",
        )

    incident = database.record_review(
        incident_id=incident_id,
        reviewer=reviewer,
        new_status=body.status,
        assessment=body.assessment,
        notes=body.notes,
        escalated=body.escalated,
    )
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident["reviews"] = database.list_reviews(incident_id)
    return incident


@app.get("/api/incidents/{incident_id}/reviews", response_model=list[IncidentReviewResponse])
def list_incident_reviews(incident_id: int):
    """Full review history for one incident, oldest first."""
    if database.get_incident(incident_id) is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return [
        IncidentReviewResponse(**{**row, "escalated": bool(row.get("escalated"))})
        for row in database.list_reviews(incident_id)
    ]


@app.get("/api/review-options")
def review_options():
    """Vocabulary the review UI should offer, so it cannot drift from the API."""
    return {
        "statuses": list(ALLOWED_STATUSES),
        "assessments": list(database.REVIEW_ASSESSMENTS),
    }


@app.get("/api/statistics", response_model=StatisticsResponse)
def get_statistics():
    """Get dashboard statistics."""
    stats = database.get_statistics()
    return StatisticsResponse(**stats)


@app.get("/api/video/{video_type}/{filename}")
def serve_video(video_type: str, filename: str):
    """Serve processed or evidence files."""
    if video_type == "processed":
        directory = PROCESSED_DIR
    elif video_type == "evidence":
        directory = EVIDENCE_DIR
    else:
        raise HTTPException(status_code=400, detail="Invalid video type")
    file_path = directory / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(file_path))
