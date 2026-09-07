"""GuardianAI backend configuration module."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()

# Directory definitions
UPLOAD_DIR = BASE_DIR / "data" / "uploads"
PROCESSED_DIR = BASE_DIR / "data" / "processed"
EVIDENCE_DIR = BASE_DIR / "data" / "evidence"
MODELS_DIR = BASE_DIR / "models"
ULTRALYTICS_DIR = BASE_DIR / "data" / "ultralytics"

os.environ.setdefault("YOLO_CONFIG_DIR", str(ULTRALYTICS_DIR))

for d in [UPLOAD_DIR, PROCESSED_DIR, EVIDENCE_DIR, MODELS_DIR, ULTRALYTICS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Safe resolution of model and database paths
# The repository ships yolo11n.pt at its root. Pointing the default at
# models/yolo11n.pt ignored that file and downloaded another copy on every
# fresh ephemeral deploy.
_model_env = os.getenv("YOLO_MODEL_PATH", "yolo11n.pt").strip()
if not Path(_model_env).is_absolute():
    if (BASE_DIR / _model_env).exists():
        YOLO_MODEL_PATH = str(BASE_DIR / _model_env)
    elif (MODELS_DIR / _model_env).exists():
        YOLO_MODEL_PATH = str(MODELS_DIR / _model_env)
    elif (MODELS_DIR / "yolo11n.pt").exists():
        YOLO_MODEL_PATH = str(MODELS_DIR / "yolo11n.pt")
    else:
        YOLO_MODEL_PATH = str(BASE_DIR / _model_env)
else:
    YOLO_MODEL_PATH = _model_env

def _optional_model_path(env_var: str) -> str:
    """Resolve an optional custom-weights path, or "" when not configured.

    Used for the fire and weapon checkpoints. COCO has no fire/smoke/firearm
    class, so these are the escape hatch for users who bring their own
    fine-tuned model. Returns "" when unset or missing on disk, which makes the
    corresponding detector fall back to its heuristic path.
    """
    raw = os.getenv(env_var, "").strip()
    if not raw:
        return ""
    candidate = Path(raw)
    for path in (candidate, BASE_DIR / raw, MODELS_DIR / raw):
        if path.exists():
            return str(path)
    print(f"Warning: {env_var}={raw!r} was set but no such file exists; ignoring.")
    return ""


#: Optional fine-tuned checkpoints. Empty string == not configured.
FIRE_MODEL_PATH = _optional_model_path("FIRE_MODEL_PATH")
WEAPON_MODEL_PATH = _optional_model_path("WEAPON_MODEL_PATH")

_db_env = os.getenv("DATABASE_PATH", "data/guardianai.db").strip()
DATABASE_PATH = str(Path(_db_env) if Path(_db_env).is_absolute() else (BASE_DIR / _db_env))
# Render advertises this variable to every hosted service. Its free instance is
# deliberately tiny, so use a lighter inference cadence there unless the owner
# explicitly overrides the settings.
IS_RENDER = os.getenv("RENDER", "").strip().lower() == "true"
PROCESS_EVERY_N_FRAMES = int(
    os.getenv("PROCESS_EVERY_N_FRAMES", "5" if IS_RENDER else "2")
)
# A 640px YOLO tensor pushed the complete FastAPI + PyTorch + OpenCV process
# beyond Render Free's 512 MB ceiling near the end of a job. 416 is still a
# multiple of YOLO's 32px stride and leaves enough headroom for video encoding.
MAX_FRAME_WIDTH = int(os.getenv("MAX_FRAME_WIDTH", "480" if IS_RENDER else "960"))
YOLO_IMAGE_SIZE = int(os.getenv("YOLO_IMAGE_SIZE", "416" if IS_RENDER else "640"))
YOLO_MAX_DETECTIONS = max(int(os.getenv("YOLO_MAX_DETECTIONS", "100")), 1)
TORCH_NUM_THREADS = max(
    int(os.getenv("TORCH_NUM_THREADS", "1" if IS_RENDER else "0")), 0
)
INCIDENT_COOLDOWN_SECONDS = float(os.getenv("INCIDENT_COOLDOWN_SECONDS", "8"))
ZONE_PERSISTENCE_FRAMES = int(os.getenv("ZONE_PERSISTENCE_FRAMES", "10"))
FALL_PERSISTENCE_FRAMES = int(os.getenv("FALL_PERSISTENCE_FRAMES", "6"))

FALL_RATIO_THRESHOLD = float(os.getenv("FALL_RATIO_THRESHOLD", "1.4"))
FALL_VERTICAL_SPEED_THRESHOLD = float(os.getenv("FALL_VERTICAL_SPEED_THRESHOLD", "0.02"))
FALL_MIN_HEIGHT_DROP = float(os.getenv("FALL_MIN_HEIGHT_DROP", "0.08"))

# --- Accuracy hardening --------------------------------------------------------
# A brand-new track has an unstable box and an unreliable class. Requiring a
# few confirmed observations before it may raise an incident removes most
# single-frame false positives at the cost of a fraction of a second of latency.
MIN_TRACK_AGE_FRAMES = int(os.getenv("MIN_TRACK_AGE_FRAMES", "3"))
#: Window (in processed observations) for the rolling confidence mean reported
#: on an incident. Instantaneous confidence is noisy frame to frame.
CONFIDENCE_SMOOTHING_WINDOW = int(os.getenv("CONFIDENCE_SMOOTHING_WINDOW", "8"))

# --- Fire / smoke detection ----------------------------------------------------
FIRE_PERSISTENCE_FRAMES = int(os.getenv("FIRE_PERSISTENCE_FRAMES", "8"))
#: Minimum share of the frame that must look like flame before it counts.
FIRE_MIN_AREA_RATIO = float(os.getenv("FIRE_MIN_AREA_RATIO", "0.004"))
#: Flames flicker. A static orange object (a traffic cone, a hi-vis jacket)
#: does not. This is the minimum temporal-variance score required.
FIRE_MIN_FLICKER_SCORE = float(os.getenv("FIRE_MIN_FLICKER_SCORE", "0.12"))
SMOKE_PERSISTENCE_FRAMES = int(os.getenv("SMOKE_PERSISTENCE_FRAMES", "12"))
SMOKE_MIN_AREA_RATIO = float(os.getenv("SMOKE_MIN_AREA_RATIO", "0.020"))
ENABLE_SMOKE_DETECTION = os.getenv("ENABLE_SMOKE_DETECTION", "true").lower() != "false"

# --- Weapon detection ----------------------------------------------------------
WEAPON_CONFIDENCE_THRESHOLD = float(os.getenv("WEAPON_CONFIDENCE_THRESHOLD", "0.35"))
WEAPON_PERSISTENCE_FRAMES = int(os.getenv("WEAPON_PERSISTENCE_FRAMES", "3"))
#: How close (as a multiple of the person's box width) a weapon must be to a
#: person before the incident is escalated to "Armed Person".
WEAPON_PERSON_PROXIMITY = float(os.getenv("WEAPON_PERSON_PROXIMITY", "0.6"))

# --- Traffic accident detection ------------------------------------------------
#: Speed, in box-widths per second, above which a vehicle counts as "moving".
ACCIDENT_MIN_SPEED = float(os.getenv("ACCIDENT_MIN_SPEED", "0.35"))
#: Fractional speed loss within the deceleration window that flags a hard stop.
ACCIDENT_DECEL_RATIO = float(os.getenv("ACCIDENT_DECEL_RATIO", "0.65"))
#: Seconds over which deceleration is measured.
ACCIDENT_DECEL_WINDOW_SECONDS = float(os.getenv("ACCIDENT_DECEL_WINDOW_SECONDS", "0.6"))
#: Box overlap (IoU) between two vehicles that counts as contact.
ACCIDENT_CONTACT_IOU = float(os.getenv("ACCIDENT_CONTACT_IOU", "0.15"))
ACCIDENT_PERSISTENCE_FRAMES = int(os.getenv("ACCIDENT_PERSISTENCE_FRAMES", "3"))
#: Relative aspect-ratio change that suggests a vehicle has overturned.
ACCIDENT_OVERTURN_RATIO_DELTA = float(os.getenv("ACCIDENT_OVERTURN_RATIO_DELTA", "0.45"))

BACKEND_HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))

# Uploads are copied in chunks and rejected once this limit is crossed. This is
# especially important on 512 MB hosts, where buffering an unbounded video can
# kill the process before FastAPI can return a useful error.
MAX_UPLOAD_MB = max(int(os.getenv("MAX_UPLOAD_MB", "50")), 1)
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Completed/failed in-memory job metadata is retained long enough for a browser
# to reconnect, then pruned. Media and incident data keep their existing
# storage behaviour.
ANALYSIS_JOB_TTL_SECONDS = max(
    int(os.getenv("ANALYSIS_JOB_TTL_SECONDS", "3600")), 60
)
