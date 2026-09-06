"""Pydantic schemas for GuardianAI API."""
from typing import Optional
from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    camera_name: str = Field(default="Camera 01", description="Name of the camera")
    location: str = Field(default="Main Entrance", description="Location label")
    zone_x1: float = Field(default=0.6, ge=0.0, le=1.0)
    zone_y1: float = Field(default=0.3, ge=0.0, le=1.0)
    zone_x2: float = Field(default=0.9, ge=0.0, le=1.0)
    zone_y2: float = Field(default=0.8, ge=0.0, le=1.0)
    zone_sensitivity: float = Field(default=0.5, ge=0.0, le=1.0)
    enable_intrusion: bool = True
    enable_fall_detection: bool = True
    enable_fire_detection: bool = False
    enable_weapon_detection: bool = False
    enable_accident_detection: bool = False


class IncidentResponse(BaseModel):
    id: int
    incident_code: str
    event_type: str
    camera_name: Optional[str]
    location: Optional[str]
    person_track_id: Optional[int]
    video_timestamp: Optional[float]
    confidence: Optional[float]
    risk_score: Optional[float]
    severity: Optional[str]
    explanation: Optional[str]
    ai_summary: Optional[str]
    evidence_path: Optional[str]
    status: str
    created_at: str
    #: Which detector raised this: "coco", "model" (custom checkpoint),
    #: "heuristic" (classical CV) or "kinematic". Optional so older rows and
    #: existing callers keep validating.
    detection_method: Optional[str] = None
    #: "x1,y1,x2,y2" in processed-video pixels, for framing the evidence still.
    bbox: Optional[str] = None


class AnalyzeResponse(BaseModel):
    success: bool
    message: str
    processed_video_path: Optional[str] = None
    processed_video_url: Optional[str] = None
    people_tracked: int = 0
    vehicles_tracked: int = 0
    incidents_created: int = 0
    incidents: list[IncidentResponse] = []
    processing_duration_seconds: float = 0.0
    #: Which capabilities the caller enabled for this run.
    features: dict = {}
    #: Per-capability flag: True when a purpose-trained checkpoint was used
    #: rather than the heuristic fallback. Lets the UI be honest about how much
    #: weight an operator should put on a fire or weapon alert.
    custom_models: dict = {}


class StatusUpdateRequest(BaseModel):
    status: str


class ReviewRequest(BaseModel):
    """An operator's verification of one incident."""

    reviewer: str = Field(min_length=1, max_length=120)
    status: Optional[str] = None
    #: One of database.REVIEW_ASSESSMENTS. Kept separate from `status` because
    #: "was this real?" and "what happens next?" are different questions: a real
    #: incident can be resolved, and a false positive can still be escalated for
    #: a model-tuning review.
    assessment: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=4000)
    escalated: bool = False


class IncidentReviewResponse(BaseModel):
    """One row of an incident's append-only review history."""

    id: int
    incident_id: int
    reviewer: str
    previous_status: Optional[str] = None
    new_status: Optional[str] = None
    assessment: Optional[str] = None
    notes: Optional[str] = None
    escalated: bool = False
    created_at: str


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    database_connected: bool
    version: str = "1.0.0"


class StatisticsResponse(BaseModel):
    total_incidents: int
    pending_verification: int
    verified: int
    high_risk: int
    event_type_distribution: dict
    severity_distribution: dict
    #: --- Reviewer analytics. Defaulted so a stale database still validates. ---
    reviewed_count: int = 0
    critical_pending: int = 0
    assessment_distribution: dict = {}
    #: None (not 0.0) when nothing has been judged either way, so the UI can say
    #: "no data" instead of implying a perfect detector.
    false_positive_rate: Optional[float] = None
    mean_seconds_to_review: Optional[float] = None
