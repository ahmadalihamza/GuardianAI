/**
 * TypeScript mirrors of the FastAPI/Pydantic schemas in `backend/schemas.py`
 * and the raw SQLite rows returned by `backend/database.py`.
 *
 * Note the asymmetry in the backend: `GET /api/incidents` and
 * `GET /api/incidents/{id}` return whole SQLite rows, while the `incidents`
 * array inside `POST /api/analyze` is the narrower `IncidentResponse` model.
 * Fields only present on the full row are therefore optional here.
 */

/**
 * Every event type the risk engine scores, grouped the way an operator thinks
 * about them. Mirrors `EVENT_SERIOUSNESS` in `backend/risk_engine.py`; the
 * filter dropdown and the legend both read from these lists.
 */
export const PERIMETER_EVENTS = [
  "Restricted Zone Intrusion",
  "Extended Intrusion",
] as const;

export const SAFETY_EVENTS = ["Potential Fall"] as const;

export const WEAPON_EVENTS = ["Weapon Detected", "Armed Person"] as const;

export const FIRE_EVENTS = ["Smoke Detected", "Fire Detected"] as const;

export const TRAFFIC_EVENTS = [
  "Vehicle Collision",
  "Vehicle-Pedestrian Collision",
  "Sudden Vehicle Stop",
  "Vehicle Overturn",
] as const;

export const EVENT_TYPES = [
  ...PERIMETER_EVENTS,
  ...SAFETY_EVENTS,
  ...WEAPON_EVENTS,
  ...FIRE_EVENTS,
  ...TRAFFIC_EVENTS,
] as const;

/** Mirrors `CRITICAL_EVENT_TYPES` — seriousness ≥ 0.90. */
export const CRITICAL_EVENT_TYPES: readonly string[] = [
  "Weapon Detected",
  "Armed Person",
  "Fire Detected",
  "Vehicle Collision",
  "Vehicle-Pedestrian Collision",
  "Vehicle Overturn",
];

export const EVENT_GROUPS: ReadonlyArray<{
  label: string;
  events: readonly string[];
}> = [
  { label: "Perimeter", events: PERIMETER_EVENTS },
  { label: "Personal Safety", events: SAFETY_EVENTS },
  { label: "Weapons", events: WEAPON_EVENTS },
  { label: "Fire & Smoke", events: FIRE_EVENTS },
  { label: "Traffic", events: TRAFFIC_EVENTS },
];

export const SEVERITIES = ["High", "Medium", "Low"] as const;

export const STATUSES = [
  "Pending Verification",
  "Verified",
  "Dismissed",
  "Resolved",
] as const;

/** Mirrors `database.REVIEW_ASSESSMENTS`. */
export const ASSESSMENTS = [
  "True Positive",
  "False Positive",
  "Unverifiable",
] as const;

export type Severity = (typeof SEVERITIES)[number];
export type IncidentStatus = (typeof STATUSES)[number];
export type Assessment = (typeof ASSESSMENTS)[number];

/** One append-only row of the `incident_reviews` audit table. */
export interface IncidentReview {
  id: number;
  incident_id: number;
  reviewer: string;
  previous_status: string | null;
  new_status: string | null;
  assessment: string | null;
  notes: string | null;
  escalated: boolean | number;
  created_at: string;
}

export interface Incident {
  id: number;
  incident_code: string;
  event_type: string;
  camera_name: string | null;
  location: string | null;
  person_track_id: number | null;
  video_timestamp: number | null;
  confidence: number | null;
  risk_score: number | null;
  severity: string | null;
  explanation: string | null;
  ai_summary: string | null;
  evidence_path: string | null;
  status: string;
  created_at: string;

  /** How the event was found: `coco`, `kinematic`, `heuristic` or a custom model. */
  detection_method?: string | null;
  /** `"x1,y1,x2,y2"` in pixels, or null for events with no box. */
  bbox?: string | null;

  /** Present on full SQLite rows, absent in the analyze response. */
  source_video?: string | null;
  seriousness_score?: number | null;
  persistence_score?: number | null;
  context_score?: number | null;
  processed_video_path?: string | null;
  updated_at?: string;

  /** Verification metadata, written by `POST /api/incidents/{id}/review`. */
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  operator_assessment?: string | null;
  review_notes?: string | null;
  escalated?: boolean | number | null;
  /** Only populated by `GET /api/incidents/{id}`. */
  reviews?: IncidentReview[];
}

export interface Statistics {
  total_incidents: number;
  pending_verification: number;
  verified: number;
  high_risk: number;
  event_type_distribution: Record<string, number>;
  severity_distribution: Record<string, number>;

  /** Reviewer analytics. */
  reviewed_count: number;
  critical_pending: number;
  assessment_distribution: Record<string, number>;
  /** `false / (true + false)` — null until an incident has been judged. */
  false_positive_rate: number | null;
  mean_seconds_to_review: number | null;
}

export interface HealthStatus {
  status: string;
  model_loaded: boolean;
  database_connected: boolean;
  version?: string;
}

/** Which detectors the operator asked for on a given run. */
export interface FeatureFlags {
  intrusion?: boolean;
  fall?: boolean;
  fire?: boolean;
  weapon?: boolean;
  accident?: boolean;
}

export interface AnalyzeResult {
  success: boolean;
  message?: string;
  detail?: string;
  processed_video_path?: string | null;
  processed_video_url?: string | null;
  people_tracked?: number;
  vehicles_tracked?: number;
  incidents_created?: number;
  incidents?: Incident[];
  processing_duration_seconds?: number;
  features?: FeatureFlags;
  /** True where a purpose-trained checkpoint was loaded instead of a heuristic. */
  custom_models?: Record<string, boolean>;
}

export type AnalysisJobState =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "unreachable";

/** Pollable wrapper used so a hosted proxy never holds a CPU-bound request. */
export interface AnalysisJob {
  job_id: string;
  status: AnalysisJobState;
  progress?: number;
  processed_frames?: number;
  total_frames?: number;
  stage?: string;
  status_url?: string;
  result?: AnalyzeResult | null;
  error?: string | null;
  detail?: string;
}

export interface IncidentFilters {
  event_type?: string;
  severity?: string;
  status?: string;
  location?: string;
}

/** Normalised restricted-zone rectangle, all values in the 0..1 range. */
export interface Zone {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const DEFAULT_ZONE: Zone = { x1: 0.6, y1: 0.3, x2: 0.9, y2: 0.8 };

export const EMPTY_STATISTICS: Statistics = {
  total_incidents: 0,
  pending_verification: 0,
  verified: 0,
  high_risk: 0,
  event_type_distribution: {},
  severity_distribution: {},
  reviewed_count: 0,
  critical_pending: 0,
  assessment_distribution: {},
  false_positive_rate: null,
  mean_seconds_to_review: null,
};

export const UNREACHABLE_HEALTH: HealthStatus = {
  status: "unreachable",
  model_loaded: false,
  database_connected: false,
};
