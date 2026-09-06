# GuardianAI Dashboard (Next.js)

The operator-facing control room for GuardianAI. Replaces the previous Streamlit
app with a Next.js 15 App Router application: Server Components read the FastAPI
backend, Server Actions perform status updates, and Route Handlers proxy video
upload and evidence media.

## Requirements

- Node.js **18.18+** (20 LTS recommended) and npm
- The GuardianAI backend running on `http://localhost:8000`

## Getting started

```bash
npm install
```

```bash
npm run dev
```

The dashboard is served on http://localhost:3000.

## Configuration

Copy the example env file if you need to point at a non-default backend:

```bash
cp .env.local.example .env.local
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `BACKEND_URL` | `http://localhost:8000` | FastAPI base URL, read **only** on the server |
| `ANALYZE_SUBMIT_TIMEOUT_MS` | `120000` (2 min) | Upload + background-job creation budget |
| `MAX_UPLOAD_MB` | `50` | Frontend upload rejection limit; match the backend |

`BACKEND_URL` is deliberately *not* a `NEXT_PUBLIC_*` variable: the browser
never talks to port 8000. Every backend call goes through this app, so a single
origin serves the UI, the API proxy, and the media files.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |

## Structure

```
frontend/
├── app/
│   ├── layout.tsx                     # Shell: sidebar + content column
│   ├── page.tsx                       # Overview (metrics, charts, recent)
│   ├── analyze/page.tsx               # Upload & analyze
│   ├── incidents/page.tsx             # Filterable incident list
│   ├── incidents/[id]/page.tsx        # Incident review & verification
│   ├── system/page.tsx                # System information
│   ├── error.tsx / loading.tsx / not-found.tsx
│   ├── globals.css                    # Tailwind v4 theme + gradients
│   └── api/
│       ├── health/route.ts            # GET  → backend /health
│       ├── analyze/route.ts           # POST → create backend analysis job
│       ├── analyze/[jobId]/route.ts   # GET  → poll job progress/result
│       └── media/[kind]/[filename]/route.ts   # evidence & processed video
├── components/                        # Presentational + client components
└── lib/
    ├── api.ts                         # Server-only backend client
    ├── actions.ts                     # "use server" status update + review
    ├── format.ts                      # Formatting, theming, risk breakdown
    └── types.ts                       # Mirrors backend/schemas.py
```

## Implementation notes

- **Media proxy.** The backend stores absolute filesystem paths for evidence
  frames and annotated video, which a browser cannot open. `lib/format.mediaUrl`
  reduces a path to its basename and routes it through
  `/api/media/{evidence|processed}/{filename}`, which forwards the `Range`
  header so `<video>` seeking works.
- **Upload and processing progress.** `AnalyzeForm` uses `XMLHttpRequest` for
  real upload progress. The backend then returns `202 Accepted`, processes one
  video at a time, and exposes processed-frame progress through a polled job
  resource. No proxy request stays open for the multi-minute CPU task.
- **Filters in the URL.** `/incidents` reads its filters from `searchParams` on
  the server, so a filtered view is shareable and survives a reload.
- **No charting dependency.** The donut and bar charts are hand-drawn SVG and
  flexbox, keeping the palette identical to the old Plotly charts.
- **Event colours are keyed on the event, not the response order.** `eventTheme`
  matches on substrings, so fire stays orange and traffic stays cyan across
  reloads, and an event type added later lands in the right group instead of
  falling through to grey.
- **Two separate verification affordances.** `StatusControls` re-files an
  incident with one click and records no judgement; `ReviewPanel` records a
  reviewer, a True / False / Unverifiable assessment, notes and an escalation
  flag, and appends an audit row. Only the latter feeds the accuracy statistics,
  so they are kept visibly distinct rather than merged.
- **Missing data is not zero.** `formatRate` returns `—` for a `null` rate so
  "nothing judged yet" can never be misread as a measured 0% false-positive
  rate.
- **Region events have no subject.** Fire, smoke and vehicle incidents carry
  `person_track_id = -1`; every surface checks `>= 0` before printing a track
  number, which is also why an explicit numeric check replaced a truthiness test
  that would have hidden track 0.

## Security

This dashboard has **no authentication**. It is intended for local, single-
operator demo use. Do not expose port 3000 (or the backend on 8000) to an
untrusted network — anyone who can reach it can upload video, read every
incident with its evidence frames, and change incident status.

Reviewer names are typed by the operator and cached in `localStorage`. They are
an accountability label, not an identity check — anyone with access can enter any
name, so the audit trail is only as trustworthy as the network you run it on.
