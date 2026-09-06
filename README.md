# 🛡️ GuardianAI: Intelligent Emergency Detection and Response Platform

GuardianAI is a computer vision platform that analyzes surveillance video and flags events a human should look at. It combines a single YOLO11n detection pass, ByteTrack tracking, and five parallel rule engines — restricted-zone intrusion, falls, weapons, fire and smoke, and traffic accidents — behind a mandatory human-verification workflow with an append-only audit trail.

## 🎯 Problem Statement

Security operators monitoring surveillance footage face alert fatigue, missed incidents, and delayed response times. Manual monitoring of hours of footage is error-prone, and critical events like falls or unauthorized zone entries can go unnoticed.

## 💡 Solution

GuardianAI provides automated decision-support by:
- Detecting and tracking people and vehicles in uploaded videos
- Identifying restricted-zone intrusions and potential falls
- Flagging weapons, and escalating to *Armed Person* when a weapon is near someone
- Detecting fire and smoke by colour, flicker and persistence
- Detecting vehicle collisions, overturns, hard stops and vehicle-pedestrian impact
- Generating explainable risk scores
- Requiring human verification, and recording who decided what, when

## ✨ Features

| Feature | Status | Notes |
|---------|--------|-------|
| Person & vehicle detection (YOLO11n) | ✅ | One inference pass per frame for all enabled detectors |
| Multi-object tracking (ByteTrack) | ✅ | Stable track IDs across occlusion |
| Restricted-zone intrusion detection | ✅ | Trained COCO class + zone geometry |
| Potential-fall detection | ✅ | Aspect-ratio and centroid transition |
| Weapon detection | ⚠️ | Heuristic — COCO knife/bat/scissors proxies, no firearm class |
| Fire & smoke detection | ⚠️ | Heuristic — chromatic gate + temporal flicker, no trained class |
| Traffic accident detection | ✅ | Scale-invariant kinematics on tracked vehicles |
| Per-detector toggles | ✅ | Enable only what the scene needs |
| Custom checkpoint override | ✅ | `FIRE_MODEL_PATH` / `WEAPON_MODEL_PATH` |
| Annotated video generation | ✅ | H.264 output |
| Evidence-frame capture | ✅ | One JPEG per incident |
| Explainable risk scoring | ✅ | Four visible weighted components |
| False-positive hardening | ✅ | Min track age, rolling confidence mean, per-key cooldown |
| SQLite incident storage | ✅ | WAL mode |
| Next.js control-room dashboard | ✅ | Server Components + Server Actions |
| Human verification workflow | ✅ | True / False / Unverifiable + notes + escalation |
| Append-only review audit trail | ✅ | Rows are never edited or deleted |
| Reviewer analytics | ✅ | Coverage, false-positive rate, mean time to review |
| AI summaries (Qwen via DashScope) | ✅ | Optional |
| Template summaries (no API key) | ✅ | Deterministic fallback |
| Simulated dispatch panel | ✅ | Never contacts a real service |

⚠️ = works, but is inferred rather than trained. See [Detector Honesty](#-detector-honesty).

## 🏗️ Architecture

```
┌──────────────────────┐    HTTP     ┌─────────────────┐
│   Next.js 15         │ ◄─────────► │    FastAPI      │
│   Dashboard          │  REST API   │    Backend      │
│   (Port 3000)        │  (server-   │    (Port 8000)  │
│                      │   side only)│                 │
│ Server Components    │             └────────┬────────┘
│ Server Actions       │                      │
│ /api/* proxy routes  │                      │
└──────────────────────┘                      │
        ▲                                     │
        │ browser talks to port 3000 only     │
        │                   ┌─────────────────┼─────────────────┐
   ┌────┴─────┐             │                 │                 │
   │ Operator │       ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
   └──────────┘       │  YOLO11n  │    │ ByteTrack │    │  SQLite   │
                      │ Detection │    │ Tracking  │    │ Database  │
                      └───────────┘    └───────────┘    └───────────┘
```

The browser never contacts port 8000 directly. `BACKEND_URL` is read only by the
Next.js server, which proxies analysis uploads and evidence/video media.

## 📁 Folder Structure

```
guardianai/
├── backend/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration & env vars
│   ├── database.py          # SQLite operations
│   ├── schemas.py           # Pydantic models
│   ├── detector.py          # YOLO11n multi-class detection
│   ├── coco_classes.py      # Class-ID groups: people, vehicles, weapon proxies
│   ├── tracker.py           # ByteTrack integration
│   ├── event_detector.py    # Zone & fall detection
│   ├── weapon_detector.py   # Weapon attribution & Armed Person escalation
│   ├── fire_detector.py     # Fire & smoke colour/flicker heuristics
│   ├── accident_detector.py # Vehicle kinematics: collision, overturn, stop
│   ├── risk_engine.py       # Risk scoring formula
│   ├── video_processor.py   # Video I/O & annotation
│   ├── report_generator.py  # Template & AI summaries
│   └── utils.py             # Helper functions
├── frontend/                # Next.js 15 dashboard (App Router)
│   ├── app/
│   │   ├── layout.tsx       # Sidebar shell
│   │   ├── page.tsx         # Overview
│   │   ├── analyze/         # Upload & analyze
│   │   ├── incidents/       # List + [id] review page
│   │   ├── system/          # System information
│   │   ├── globals.css      # Tailwind v4 theme
│   │   └── api/             # health / analyze / media proxy routes
│   ├── components/          # UI components
│   ├── lib/                 # api.ts, actions.ts, format.ts, types.ts
│   ├── package.json
│   └── README.md            # Dashboard-specific docs
├── data/
│   ├── uploads/             # Uploaded videos
│   ├── processed/           # Annotated output videos
│   └── evidence/            # Evidence frame images
├── demo/                    # Demo video storage
├── models/                  # YOLO model weights
├── tests/
│   ├── test_risk_engine.py
│   ├── test_event_detector.py
│   ├── test_weapon_detector.py
│   ├── test_fire_detector.py
│   ├── test_accident_detector.py
│   ├── test_review_audit.py
│   ├── test_report_generator.py
│   └── test_full_pipeline.py
├── .env.example             # Environment template
├── .gitignore
├── requirements.txt         # Backend (Python) dependencies only
├── run_backend.bat/.sh      # Backend launchers
├── run_frontend.bat/.sh     # Dashboard launchers
└── README.md
```

## 🚀 Installation

### Prerequisites
- Python 3.11 (backend)
- Node.js 18.18+ / 20 LTS and npm (dashboard)
- 4GB+ RAM (8GB recommended)

### Step 1: Clone or extract the project

```bash
cd guardianai
```

### Step 2: Create the Python virtual environment

Windows:

```cmd
python -m venv venv && venv\Scripts\activate
```

Linux / macOS:

```bash
python3 -m venv venv && source venv/bin/activate
```

### Step 3: Install backend dependencies

```bash
pip install -r requirements.txt
```

The YOLO11n model will download automatically on first run (~6MB).

### Step 4: Install dashboard dependencies

```bash
npm install --prefix frontend
```

### Step 5: Configure environment (optional)

```bash
cp .env.example .env
```

Edit `.env` to add a DashScope API key for AI summaries (optional). If the
backend does not run on `http://localhost:8000`, also create
`frontend/.env.local` from `frontend/.env.local.example` and set `BACKEND_URL`.

## ▶️ Running the Application

Both tiers run at the same time, in two terminals.

### Terminal 1: Start the Backend

Windows:

```cmd
run_backend.bat
```

Linux / macOS:

```bash
./run_backend.sh
```

Or manually:

```bash
uvicorn backend.main:app --reload --port 8000
```

### Terminal 2: Start the Dashboard

Windows:

```cmd
run_frontend.bat
```

Linux / macOS:

```bash
./run_frontend.sh
```

Or manually:

```bash
npm run dev --prefix frontend
```

Pass `--prod` to either launcher to run `next build` followed by `next start`.

### Access
- Dashboard: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

## 🤖 Configuring Qwen (Optional)

1. Get a DashScope API key from https://dashscope.aliyun.com/
2. Add to `.env`:
   ```
   DASHSCOPE_API_KEY=sk-your-key-here
   ```
3. Restart the backend

Without a key, the system uses deterministic template summaries.

## 🎬 Selecting Demo Videos

For best results, use short videos (10-60 seconds) with:
- A clear view of the subject (not too distant)
- Stable camera (not shaky)
- Good lighting
- The relevant subject visible — a person, a vehicle, or a flame

Test scenarios:
- **Intrusion:** Person walking into a marked area
- **Fall:** Person transitioning from standing to ground level
- **Weapon:** Person carrying a knife or bat-like object in clear view
- **Fire:** Open flame or a visibly growing smoke plume
- **Traffic:** Dashcam or junction footage with a collision or hard braking
- **Normal:** People walking without entering restricted zones

Enable only the detectors the clip actually needs. Running all five on unrelated
footage is the fastest way to generate noise.

## 🧭 Detectors

Five engines read the same detection pass, so nothing is inferred twice.

| Detector | Events | Basis | Trained class |
|----------|--------|-------|---------------|
| Zone intrusion | Restricted Zone Intrusion · Extended Intrusion | COCO `person` + zone polygon | Yes |
| Fall | Potential Fall | Box aspect-ratio + centroid drop | Yes |
| Weapon | Weapon Detected · Armed Person | COCO knife / baseball bat / scissors | **No** |
| Fire & smoke | Fire Detected · Smoke Detected | Chromatic gate + temporal flicker | **No** |
| Traffic accident | Vehicle Collision · Vehicle-Pedestrian Collision · Sudden Vehicle Stop · Vehicle Overturn | Scale-invariant vehicle kinematics | Yes |

Vehicle and fire events are *region* events with no human subject; they are
stored with `person_track_id = -1` and the UI shows "Region event" rather than
inventing a person.

### ⚖️ Detector Honesty

**Fire, smoke and weapon detection are heuristic.** COCO — the dataset YOLO11n
ships with — contains no fire class, no smoke class and no firearm class.

- **Weapons** are detected through proxy classes (`knife`, `baseball bat`,
  `scissors`). A phone or a tool can trip them, and a handgun will not.
- **Fire and smoke** are found with classical computer vision: a colour gate,
  then a temporal flicker test that rejects static orange objects such as
  traffic cones and hi-vis jackets, then a persistence requirement.

Treat both as a prompt for a human to look, not as a conclusion. To replace
either with a real model, point `FIRE_MODEL_PATH` or `WEAPON_MODEL_PATH` at your
own fine-tuned weights; the heuristic is then bypassed and the dashboard marks
the detector as running on a custom checkpoint.

## 📊 Risk Score Explanation

```
risk_score = round(100 × (0.45×confidence + 0.25×seriousness + 0.20×persistence + 0.10×context))
```

| Component | Weight | Source |
|-----------|--------|--------|
| Confidence | 45% | Rolling-mean detection confidence over `CONFIDENCE_SMOOTHING_WINDOW` |
| Seriousness | 25% | Event type (see table below) |
| Persistence | 20% | Duration of condition relative to threshold |
| Context | 10% | Zone sensitivity setting |

**Severity:** Low (0-39) | Medium (40-69) | High (70-100)

Event seriousness, highest first. Anything at 0.90 or above is a **critical
event type** and is counted separately in the dashboard's "Critical Unreviewed"
metric:

| Event | Seriousness | Critical |
|-------|-------------|----------|
| Vehicle-Pedestrian Collision | 0.98 | ✅ |
| Armed Person | 0.95 | ✅ |
| Fire Detected | 0.95 | ✅ |
| Vehicle Overturn | 0.92 | ✅ |
| Weapon Detected | 0.90 | ✅ |
| Vehicle Collision | 0.90 | ✅ |
| Potential Fall | 0.85 | |
| Smoke Detected | 0.75 | |
| Extended Intrusion | 0.70 | |
| Sudden Vehicle Stop | 0.60 | |
| Restricted Zone Intrusion | 0.55 | |

## ✅ Human Verification

Verification is the point of the system, not a formality.

- **Quick Status Change** re-files an incident (Pending / Verified / Dismissed /
  Resolved) without recording a judgement.
- **Operator Verification** records a decision: reviewer name, an assessment of
  **True Positive**, **False Positive** or **Unverifiable**, free-text notes, and
  an optional escalation flag. Each submission appends a row to
  `incident_reviews` — rows are never updated or deleted, so the trail stays
  usable as evidence.
- The dashboard's **false-positive rate** counts only incidents judged True or
  False. Footage marked *Unverifiable* is excluded rather than guessed at, and a
  dash is shown when nothing has been judged yet so "no data" never reads as a
  measured 0%.

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/analyze` | Upload & analyze video (per-detector toggles in the form body) |
| GET | `/api/incidents` | List incidents (with filters) |
| GET | `/api/incidents/{id}` | Get single incident, including its review history |
| PATCH | `/api/incidents/{id}/status` | Update status only, no judgement recorded |
| POST | `/api/incidents/{id}/review` | Record a verification and append an audit row |
| GET | `/api/incidents/{id}/reviews` | Full append-only review history |
| GET | `/api/review-options` | Valid statuses and assessments for the review UI |
| GET | `/api/statistics` | Dashboard statistics, incl. reviewer analytics |
| GET | `/api/video/{video_type}/{filename}` | Stream annotated video or evidence frame |

`POST /api/analyze` accepts these detector toggles alongside the video:
`enable_intrusion_detection`, `enable_fall_detection`,
`enable_weapon_detection`, `enable_fire_detection`,
`enable_accident_detection`.

`POST /api/incidents/{id}/review` body:

```json
{
  "reviewer": "A. Okafor",
  "status": "Verified",
  "assessment": "True Positive",
  "notes": "Two vehicles made contact at 00:14. Confirmed against source clip.",
  "escalated": true
}
```

`reviewer` is required; every other field is optional, but at least one of
`status`, `assessment` or `notes` must be present — an empty review is rejected
rather than silently appended.

Static mounts: `/processed/{file}` (annotated video) and `/evidence/{file}`
(evidence frames). The dashboard reaches both through its own
`/api/media/{processed|evidence}/{file}` proxy.

## 🖥️ Dashboard Routes

| Route | Purpose |
|-------|---------|
| `/` | Control room overview — metrics, event/severity charts, recent incidents, verification quality |
| `/analyze` | Upload a video, place the restricted zone, choose detectors, run analysis |
| `/incidents` | Filterable incident list (filters are stored in the URL) |
| `/incidents/{id}` | Full review: evidence, risk breakdown, detection method, review history, operator sign-off |
| `/system` | Detector capabilities, risk formula, verification record, privacy design, live backend health |

See [`frontend/README.md`](frontend/README.md) for dashboard configuration and
implementation notes.

## 🎛️ Tuning Reference

Every knob below is read from `.env` at backend startup. Defaults are tuned for
short handheld or CCTV clips at 960px width; see [`.env.example`](.env.example)
for the annotated copy.

**Accuracy hardening** — the three settings that matter most for false positives:

| Variable | Default | Effect |
|----------|---------|--------|
| `MIN_TRACK_AGE_FRAMES` | `3` | Observations a track must survive before it may raise anything. Removes single-frame flukes. Raise it if you see alerts on flickering detections. |
| `CONFIDENCE_SMOOTHING_WINDOW` | `8` | Window for the rolling confidence mean stored on an incident, instead of one noisy frame. |
| `INCIDENT_COOLDOWN_SECONDS` | `8` | Per subject *and* event type, so a fire and a fall in the same second both get through while one condition cannot spam the log. |

**Fire & smoke:**

| Variable | Default | Effect |
|----------|---------|--------|
| `FIRE_PERSISTENCE_FRAMES` | `8` | Frames a flame region must persist. |
| `FIRE_MIN_AREA_RATIO` | `0.004` | Minimum share of the frame that must look like flame. |
| `FIRE_MIN_FLICKER_SCORE` | `0.12` | Temporal-variance floor. Lower it for distant fires; raise it if static orange objects trip alerts. |
| `SMOKE_PERSISTENCE_FRAMES` | `12` | Smoke drifts, so it needs longer than flame. |
| `SMOKE_MIN_AREA_RATIO` | `0.020` | Smoke must cover more area than flame to count. |
| `ENABLE_SMOKE_DETECTION` | `true` | Set `false` in dusty, foggy or hazy scenes. |

**Weapons:**

| Variable | Default | Effect |
|----------|---------|--------|
| `WEAPON_CONFIDENCE_THRESHOLD` | `0.35` | Proxy classes are small objects, so this sits below the person threshold. |
| `WEAPON_PERSISTENCE_FRAMES` | `3` | Frames before a weapon is reported. |
| `WEAPON_PERSON_PROXIMITY` | `0.6` | Distance, in multiples of the person's box width, within which *Weapon Detected* escalates to *Armed Person*. |

**Traffic accidents** — all speeds are in box-widths per second, which makes the
thresholds hold at any camera distance without retuning:

| Variable | Default | Effect |
|----------|---------|--------|
| `ACCIDENT_MIN_SPEED` | `0.35` | Above this, a vehicle counts as moving. |
| `ACCIDENT_DECEL_RATIO` | `0.65` | Fractional speed loss that flags a hard stop. |
| `ACCIDENT_DECEL_WINDOW_SECONDS` | `0.6` | Window over which deceleration is measured. |
| `ACCIDENT_CONTACT_IOU` | `0.15` | Box overlap counted as contact between two vehicles. |
| `ACCIDENT_PERSISTENCE_FRAMES` | `3` | Frames a condition must hold. |
| `ACCIDENT_OVERTURN_RATIO_DELTA` | `0.45` | Aspect-ratio change suggesting an overturn. |

**Optional checkpoints:** `FIRE_MODEL_PATH`, `WEAPON_MODEL_PATH` — resolved
relative to the repo root or `models/`. A path that does not exist is logged and
ignored rather than crashing the backend, and the detector stays on its
heuristic.

## 🧪 Tests

```bash
python3 -m pytest tests/ -q
```

Detector geometry, risk scoring, the review audit trail and the offline summary
template are all covered without needing a GPU. Tests that require `cv2` or
`ultralytics` skip themselves when those packages are absent, so the suite still
runs on a bare checkout.

## 🔒 Privacy & Responsible AI

- **No facial recognition** — only body detection and tracking
- **No biometric storage** — only track IDs and bounding boxes
- **Human-in-the-loop** — every alert requires operator verification
- **Auditable decisions** — reviewer names are stored with each sign-off, because
  an audit trail without an author is not an audit trail
- **No real dispatch** — simulation only, no external services contacted
- **Local processing** — videos stay on your machine
- **Transparent scoring** — every risk score is explainable
- **Stated uncertainty** — heuristic detectors are labelled as such in the UI
- **Single origin** — the browser only talks to the dashboard; `BACKEND_URL` is
  server-side and is never exposed to the client

> ⚠️ **No authentication.** Neither the dashboard (port 3000) nor the backend
> (port 8000, `CORS allow_origins=["*"]`) requires a login. This is a local demo
> deployment. Anyone who can reach those ports can upload video, read every
> incident and evidence frame, and change incident status — do not expose them
> to an untrusted network without adding an auth layer.

## ⚠️ Current Limitations

- **Weapon detection cannot see firearms** — it relies on COCO knife, bat and
  scissors proxies
- **Fire and smoke detection is pixel-based**, so it can be fooled by
  fire-coloured light, screens and reflections; the flicker test rejects static
  objects but not moving ones
- Potential-fall detection is heuristic, not medically validated
- Accident detection needs the vehicles to be tracked before the impact; a
  collision already in frame at the first detection may be missed
- Accuracy depends on camera angle, lighting, and video quality
- No real-time processing (batch analysis only)
- Single-camera per upload
- Short videos with rapid events may not trigger detection — every detector has a
  minimum persistence
- YOLO11n is the smallest variant — less accurate on occluded people

## 🔮 Future Scope

- ⚔️ Violence and fight detection
- 👥 Crowd density analysis
- 🔊 Audio anomaly detection
- 📹 Live CCTV integration
- 🧠 Trained fire and weapon checkpoints shipped by default
- 🔐 Authentication and per-reviewer accounts
- 🚨 Authorized emergency-system APIs
- 📱 Mobile alert notifications

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend won't start | Check Python 3.11 is installed and in PATH |
| Model download fails | Check internet connection; model downloads from Ultralytics |
| CUDA errors | System auto-falls back to CPU — no action needed |
| Video won't process | Use MP4 format; ensure file isn't corrupted |
| Dashboard can't connect | Sidebar shows 🔴 — verify the backend is running on port 8000 |
| `npm` not found | Install Node.js 18.18+ from https://nodejs.org |
| Dashboard build/start fails | Delete `frontend/node_modules` and `frontend/.next`, then `npm install --prefix frontend` |
| Backend on a different host/port | Set `BACKEND_URL` in `frontend/.env.local` and restart the dashboard |
| Analysis times out | Use a shorter clip, or raise `ANALYZE_TIMEOUT_MS` in `frontend/.env.local` |
| Port 3000 already in use | `npm run dev --prefix frontend -- -p 3001` |
| No detections | Ensure the subject is clearly visible, and that the matching detector is enabled |
| Too many fire alerts | Raise `FIRE_MIN_FLICKER_SCORE` and `FIRE_MIN_AREA_RATIO` |
| Smoke alerts in dust or fog | Set `ENABLE_SMOKE_DETECTION=false` |
| Everyday objects flagged as weapons | Raise `WEAPON_CONFIDENCE_THRESHOLD`, or supply `WEAPON_MODEL_PATH` |
| Braking flagged as a collision | Raise `ACCIDENT_CONTACT_IOU` and `ACCIDENT_DECEL_RATIO` |
| Alerts on brief flickering detections | Raise `MIN_TRACK_AGE_FRAMES` |
| Custom checkpoint ignored | The backend logs a warning when the path does not exist — check it is relative to the repo root or `models/` |
| Import errors | Run `pip install -r requirements.txt` again |

## 📄 License

This project is developed for hackathon demonstration purposes.
