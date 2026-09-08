import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import threading
import time
import uuid
from pathlib import Path
from typing import Callable, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend import database
from backend.config import (
    ANALYSIS_JOB_TTL_SECONDS,
    EVIDENCE_DIR,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_MB,
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


logger = logging.getLogger(__name__)

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
MAX_PENDING_ANALYSIS_JOBS = 3
UPLOAD_CHUNK_BYTES = 1024 * 1024

# Ultralytics keeps ByteTrack state on the singleton model. Calling
# reset_tracker()/model.track() concurrently corrupts that shared state and can
# exhaust a small hosted instance. Every entry point therefore uses one lock.
_analysis_lock = threading.Lock()

# Job results only need to live for the browser that submitted them. Keeping
# them in memory makes this deployable without Redis while still breaking the
# fragile multi-minute HTTP request into a quick submission plus polling.
_jobs_lock = threading.Lock()
_analysis_jobs: dict[str, dict] = {}
_job_tasks: set[asyncio.Task] = set()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _prune_jobs() -> None:
    """Remove old terminal jobs so a long-lived process cannot grow forever."""
    cutoff = time.time() - ANALYSIS_JOB_TTL_SECONDS
    with _jobs_lock:
        expired = [
            job_id
            for job_id, job in _analysis_jobs.items()
            if job["status"] in {"succeeded", "failed"}
            and job.get("updated_at_epoch", 0) < cutoff
        ]
        for job_id in expired:
            del _analysis_jobs[job_id]


def _update_job(job_id: str, **changes) -> None:
    with _jobs_lock:
        job = _analysis_jobs.get(job_id)
        if job is None:
            return
        job.update(changes)
        job["updated_at"] = _utc_now()
        job["updated_at_epoch"] = time.time()


def _job_snapshot(job_id: str) -> Optional[dict]:
    with _jobs_lock:
        job = _analysis_jobs.get(job_id)
        if job is None:
            return None
        return {key: value for key, value in job.items() if not key.endswith("_epoch")}


def _active_job_count() -> int:
    with _jobs_lock:
        return sum(
            job["status"] in {"queued", "processing"}
            for job in _analysis_jobs.values()
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and load model on startup."""
    utils.ensure_directories()
    database.init_database()
    from backend.samples import seed_samples
    seed_samples()
    try:
        load_model()
    except Exception as e:
        print(f"Warning: Could not load YOLO model on startup: {e}")
    yield


app = FastAPI(title="GuardianAI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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


async def _save_upload(video: UploadFile) -> tuple[str, str]:
    """Validate and copy an upload without allowing unbounded disk/memory use."""
    if not video.filename:
        raise HTTPException(status_code=400, detail="No video file provided")

    raw_name = Path(video.filename).name
    ext = Path(raw_name).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type: {ext}. Allowed: "
                f"{', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}"
            ),
        )

    safe_stem = (
        "".join(c for c in Path(raw_name).stem if c.isalnum() or c in "._- ")[:120]
        or "video"
    )
    upload_path = UPLOAD_DIR / f"{uuid.uuid4().hex}_{safe_stem}{ext}"
    written = 0

    try:
        with upload_path.open("wb") as target:
            while chunk := await video.read(UPLOAD_CHUNK_BYTES):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Video is too large. Maximum upload size is {MAX_UPLOAD_MB} MB.",
                    )
                target.write(chunk)
    except HTTPException:
        upload_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        upload_path.unlink(missing_ok=True)
        logger.exception("Failed to save video upload")
        raise HTTPException(status_code=500, detail="Failed to save video upload") from exc
    finally:
        await video.close()

    if written == 0:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="The uploaded video is empty")
    return raw_name, str(upload_path)


def _perform_analysis(
    *,
    raw_name: str,
    upload_path: str,
    camera_name: str,
    location: str,
    zone_norm: tuple[float, float, float, float],
    zone_sensitivity: float,
    enable_intrusion: bool,
    enable_fall_detection: bool,
    enable_fire_detection: bool,
    enable_weapon_detection: bool,
    enable_accident_detection: bool,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> AnalyzeResponse:
    """Run the shared-model pipeline and persist its incident records."""
    start_time = time.time()
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

    # The singleton YOLO model and its ByteTrack predictor are intentionally
    # serialized. This also bounds peak RAM on small hosted instances.
    with _analysis_lock:
        if progress_callback:
            progress_callback(0, 0)
        result = process_video(
            video_path=upload_path,
            zone_norm=zone_norm,
            enable_intrusion=enable_intrusion,
            enable_fall=enable_fall_detection,
            zone_sensitivity=zone_sensitivity,
            on_event_callback=on_event,
            enable_fire=enable_fire_detection,
            enable_weapon=enable_weapon_detection,
            enable_accident=enable_accident_detection,
            progress_callback=progress_callback,
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
        evidence_path = event.get("evidence_path") or evidence_frames.get(
            incident_code, ""
        )
        raw_bbox = event.get("bbox")
        bbox_text = (
            ",".join(f"{float(v):.1f}" for v in raw_bbox) if raw_bbox else None
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

    output_path = result["output_path"]
    return AnalyzeResponse(
        success=True,
        message=f"Analysis complete. {len(created_incidents)} incident(s) detected.",
        processed_video_path=output_path,
        processed_video_url=f"/processed/{Path(output_path).name}",
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
        processing_duration_seconds=round(time.time() - start_time, 2),
    )


def _analysis_kwargs(
    *,
    raw_name: str,
    upload_path: str,
    camera_name: str,
    location: str,
    zone_x1: float,
    zone_y1: float,
    zone_x2: float,
    zone_y2: float,
    zone_sensitivity: float,
    enable_intrusion: bool,
    enable_fall_detection: bool,
    enable_fire_detection: bool,
    enable_weapon_detection: bool,
    enable_accident_detection: bool,
) -> dict:
    return {
        "raw_name": raw_name,
        "upload_path": upload_path,
        "camera_name": camera_name.strip() or "Camera 01",
        "location": location.strip() or "Main Entrance",
        "zone_norm": (zone_x1, zone_y1, zone_x2, zone_y2),
        "zone_sensitivity": min(max(zone_sensitivity, 0.0), 1.0),
        "enable_intrusion": enable_intrusion,
        "enable_fall_detection": enable_fall_detection,
        "enable_fire_detection": enable_fire_detection,
        "enable_weapon_detection": enable_weapon_detection,
        "enable_accident_detection": enable_accident_detection,
    }


async def _run_analysis_job(job_id: str, kwargs: dict) -> None:
    def progress(processed_frames: int, total_frames: int) -> None:
        percent = (
            min(int(processed_frames * 100 / total_frames), 99)
            if total_frames > 0
            else 1
        )
        _update_job(
            job_id,
            status="processing",
            progress=percent,
            processed_frames=processed_frames,
            total_frames=max(total_frames, 0),
            stage=(
                f"Processing frame {processed_frames} of {total_frames}"
                if total_frames > 0
                else "Starting video processor"
            ),
        )

    try:
        response = await asyncio.to_thread(
            _perform_analysis,
            **kwargs,
            progress_callback=progress,
        )
        _update_job(
            job_id,
            status="succeeded",
            progress=100,
            stage="Analysis complete",
            result=response.model_dump(mode="json"),
            error=None,
        )
    except HTTPException as exc:
        _update_job(
            job_id,
            status="failed",
            stage="Analysis failed",
            error=str(exc.detail),
        )
    except Exception:
        logger.exception("Video analysis job %s failed", job_id)
        _update_job(
            job_id,
            status="failed",
            stage="Analysis failed",
            error="The video processor failed unexpectedly. Check the backend logs.",
        )
    finally:
        Path(kwargs["upload_path"]).unlink(missing_ok=True)


@app.post("/api/analyze/jobs", status_code=202)
async def create_analysis_job(
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
    """Accept a video quickly and process it behind a pollable job resource."""
    _prune_jobs()
    # This early check avoids receiving a whole upload when the queue is
    # already full. Capacity is checked again atomically after the awaited
    # upload because several clients can pass this point at the same time.
    if _active_job_count() >= MAX_PENDING_ANALYSIS_JOBS:
        raise HTTPException(
            status_code=429,
            detail="The analyzer queue is full. Wait for a running job and try again.",
        )

    raw_name, upload_path = await _save_upload(video)
    kwargs = _analysis_kwargs(
        raw_name=raw_name,
        upload_path=upload_path,
        camera_name=camera_name,
        location=location,
        zone_x1=zone_x1,
        zone_y1=zone_y1,
        zone_x2=zone_x2,
        zone_y2=zone_y2,
        zone_sensitivity=zone_sensitivity,
        enable_intrusion=enable_intrusion,
        enable_fall_detection=enable_fall_detection,
        enable_fire_detection=enable_fire_detection,
        enable_weapon_detection=enable_weapon_detection,
        enable_accident_detection=enable_accident_detection,
    )
    job_id = uuid.uuid4().hex
    now = _utc_now()
    queue_full = False
    with _jobs_lock:
        active_jobs = sum(
            job["status"] in {"queued", "processing"}
            for job in _analysis_jobs.values()
        )
        if active_jobs >= MAX_PENDING_ANALYSIS_JOBS:
            queue_full = True
        else:
            _analysis_jobs[job_id] = {
                "job_id": job_id,
                "status": "queued",
                "progress": 0,
                "processed_frames": 0,
                "total_frames": 0,
                "stage": "Queued for the video processor",
                "result": None,
                "error": None,
                "created_at": now,
                "updated_at": now,
                "updated_at_epoch": time.time(),
            }

    if queue_full:
        Path(upload_path).unlink(missing_ok=True)
        raise HTTPException(
            status_code=429,
            detail="The analyzer queue is full. Wait for a running job and try again.",
        )

    task = asyncio.create_task(_run_analysis_job(job_id, kwargs))
    _job_tasks.add(task)
    task.add_done_callback(_job_tasks.discard)
    return {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "status_url": f"/api/analyze/jobs/{job_id}",
    }


@app.get("/api/analyze/jobs/{job_id}")
def get_analysis_job(job_id: str):
    """Return progress, a terminal error, or the completed analyze response."""
    _prune_jobs()
    if len(job_id) != 32 or any(c not in "0123456789abcdef" for c in job_id.lower()):
        raise HTTPException(status_code=404, detail="Analysis job not found")
    job = _job_snapshot(job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "Analysis job not found. The backend may have restarted; "
                "please upload the video again."
            ),
        )
    return job


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
    """Compatibility endpoint; new clients should use the job API above."""
    raw_name, upload_path = await _save_upload(video)
    kwargs = _analysis_kwargs(
        raw_name=raw_name,
        upload_path=upload_path,
        camera_name=camera_name,
        location=location,
        zone_x1=zone_x1,
        zone_y1=zone_y1,
        zone_x2=zone_x2,
        zone_y2=zone_y2,
        zone_sensitivity=zone_sensitivity,
        enable_intrusion=enable_intrusion,
        enable_fall_detection=enable_fall_detection,
        enable_fire_detection=enable_fire_detection,
        enable_weapon_detection=enable_weapon_detection,
        enable_accident_detection=enable_accident_detection,
    )
    try:
        return await asyncio.to_thread(_perform_analysis, **kwargs)
    finally:
        Path(upload_path).unlink(missing_ok=True)


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
    if not filename or Path(filename).name != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    file_path = directory / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(file_path))
