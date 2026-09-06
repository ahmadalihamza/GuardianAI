import type { Incident } from "./types";

/** Weights from `backend/risk_engine.compute_risk_score`. */
export const RISK_WEIGHTS = {
  confidence: 0.45,
  seriousness: 0.25,
  persistence: 0.2,
  context: 0.1,
} as const;

export const RISK_FORMULA =
  "0.45 × confidence + 0.25 × seriousness + 0.20 × persistence + 0.10 × context";

export interface SeverityTheme {
  /** Hex value, for inline SVG/`style` use. */
  hex: string;
  text: string;
  border: string;
  /** Solid pill background with readable foreground. */
  pill: string;
  /** Gradient class from globals.css. */
  gradient: string;
}

const SEVERITY_THEMES: Record<string, SeverityTheme> = {
  High: {
    hex: "#f43f5e",
    text: "text-rose-400",
    border: "border-rose-500/40",
    pill: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
    gradient: "glow-danger",
  },
  Medium: {
    hex: "#f59e0b",
    text: "text-amber-400",
    border: "border-amber-500/40",
    pill: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    gradient: "glow-warn",
  },
  Low: {
    hex: "#10b981",
    text: "text-emerald-400",
    border: "border-emerald-500/40",
    pill: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    gradient: "glow-ok",
  },
};

const FALLBACK_THEME: SeverityTheme = {
  hex: "#38bdf8",
  text: "text-sky-400",
  border: "border-sky-500/40",
  pill: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  gradient: "glow-accent",
};

export function severityTheme(severity: string | null | undefined): SeverityTheme {
  return (severity && SEVERITY_THEMES[severity]) || FALLBACK_THEME;
}

const STATUS_STYLES: Record<string, string> = {
  "Pending Verification": "border-amber-500/40 bg-amber-500/10 text-amber-300",
  Verified: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  Dismissed: "border-slate-700/60 bg-slate-800/40 text-slate-400",
  Resolved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

export function statusStyle(status: string | null | undefined): string {
  return (status && STATUS_STYLES[status]) || "border-slate-700/60 bg-slate-800/40 text-slate-400";
}

const ASSESSMENT_STYLES: Record<string, string> = {
  "True Positive": "border-rose-500/40 bg-rose-500/10 text-rose-300",
  "False Positive": "border-slate-700/60 bg-slate-800/40 text-slate-400",
  Unverifiable: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

export function assessmentStyle(
  assessment: string | null | undefined,
): string {
  return (
    (assessment && ASSESSMENT_STYLES[assessment]) ||
    "border-slate-700/60 bg-slate-800/40 text-slate-400"
  );
}

export interface EventTheme {
  /** Operator-facing category, matching the groups in `lib/types.ts`. */
  group: string;
  hex: string;
  text: string;
  pill: string;
  /** Short glyph for dense lists where an SVG icon would not fit. */
  glyph: string;
}

const EVENT_THEMES: ReadonlyArray<{ match: RegExp; theme: EventTheme }> = [
  {
    match: /Fire/,
    theme: {
      group: "Fire & Smoke",
      hex: "#f97316",
      text: "text-orange-400",
      pill: "bg-orange-500/15 text-orange-300 border border-orange-500/30",
      glyph: "🔥",
    },
  },
  {
    match: /Smoke/,
    theme: {
      group: "Fire & Smoke",
      hex: "#94a3b8",
      text: "text-slate-300",
      pill: "bg-slate-500/15 text-slate-300 border border-slate-500/30",
      glyph: "🌫️",
    },
  },
  {
    match: /Weapon|Armed/,
    theme: {
      group: "Weapons",
      hex: "#a855f7",
      text: "text-purple-400",
      pill: "bg-purple-500/15 text-purple-300 border border-purple-500/30",
      glyph: "🔪",
    },
  },
  {
    match: /Vehicle/,
    theme: {
      group: "Traffic",
      hex: "#06b6d4",
      text: "text-cyan-400",
      pill: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30",
      glyph: "🚗",
    },
  },
  {
    match: /Fall/,
    theme: {
      group: "Personal Safety",
      hex: "#f43f5e",
      text: "text-rose-400",
      pill: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
      glyph: "🚑",
    },
  },
  {
    match: /Intrusion/,
    theme: {
      group: "Perimeter",
      hex: "#38bdf8",
      text: "text-sky-400",
      pill: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
      glyph: "🔒",
    },
  },
];

const UNKNOWN_EVENT_THEME: EventTheme = {
  group: "Other",
  hex: "#64748b",
  text: "text-slate-400",
  pill: "bg-slate-500/15 text-slate-300 border border-slate-500/30",
  glyph: "❓",
};

/**
 * Colour and glyph for an event type. Matched by substring rather than by exact
 * name so a future "Perimeter Intrusion" still lands in the Perimeter group
 * instead of falling through to grey.
 */
export function eventTheme(eventType: string | null | undefined): EventTheme {
  const type = eventType ?? "";
  for (const entry of EVENT_THEMES) {
    if (entry.match.test(type)) return entry.theme;
  }
  return UNKNOWN_EVENT_THEME;
}

const DETECTION_METHODS: Record<string, { label: string; detail: string }> = {
  coco: {
    label: "COCO object model",
    detail: "YOLO11n class detection plus ByteTrack identity, then rule logic.",
  },
  kinematic: {
    label: "Kinematic analysis",
    detail:
      "Derived from tracked box motion — speed, overlap and shape change over time.",
  },
  heuristic: {
    label: "Colour & motion heuristic",
    detail:
      "Classical computer vision on pixels: no trained class exists for this event.",
  },
  custom: {
    label: "Custom trained model",
    detail: "A purpose-trained checkpoint supplied through the environment.",
  },
};

export function detectionMethod(method: string | null | undefined): {
  label: string;
  detail: string;
} {
  if (!method) return { label: "—", detail: "Detection method was not recorded." };
  return (
    DETECTION_METHODS[method] ?? {
      label: method,
      detail: "Reported by the detector that raised this event.",
    }
  );
}

/** Parses the `"x1,y1,x2,y2"` string the backend stores for an event box. */
export function parseBbox(
  bbox: string | null | undefined,
): { x1: number; y1: number; x2: number; y2: number } | null {
  if (!bbox) return null;
  const parts = bbox.split(",").map((value) => Number(value.trim()));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) {
    return null;
  }
  const [x1, y1, x2, y2] = parts;
  return { x1, y1, x2, y2 };
}

/** `MM:SS` — matches `backend/utils.format_timestamp`. */
export function formatVideoTime(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatPercent(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

export function formatSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}s`;
}

/**
 * A duration in a unit an operator can read at a glance. Used for
 * `mean_seconds_to_review`, which spans seconds during a demo and hours in
 * real use.
 */
export function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const seconds = Math.max(0, value);
  if (seconds < 90) return `${seconds.toFixed(0)}s`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} d`;
}

/**
 * A 0..1 rate as whole percent. Distinguishes "nothing judged yet" (null) from
 * a genuine 0% — the difference matters when the number is being used to argue
 * that the detector is trustworthy.
 */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

/** Renders the UTC ISO timestamps written by the backend in a stable form. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

/**
 * The backend stores absolute filesystem paths for evidence and processed
 * video. Strip everything but the filename — those directories are exposed by
 * FastAPI as the `/evidence` and `/processed` static mounts.
 * Handles Windows and POSIX separators, since the DB may have been written on
 * either platform.
 */
export function basename(path: string | null | undefined): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

export type MediaKind = "evidence" | "processed";

/**
 * URL for an evidence image or processed video, routed through this app's
 * media proxy so the browser never needs direct access to the backend.
 */
export function mediaUrl(
  kind: MediaKind,
  pathOrName: string | null | undefined,
): string | null {
  const name = basename(pathOrName);
  if (!name) return null;
  return `/api/media/${kind}/${encodeURIComponent(name)}`;
}

/** Which response team the incident type implies (simulation only). */
export function dispatchFor(eventType: string | null | undefined): {
  team: string;
  icon: string;
} {
  const type = eventType ?? "";
  if (type.includes("Fire")) return { team: "Fire & Rescue Service", icon: "🚒" };
  if (type.includes("Smoke"))
    return { team: "Fire Watch / Facilities", icon: "🌫️" };
  if (type.includes("Armed"))
    return { team: "Armed Response Unit", icon: "🛡️" };
  if (type.includes("Weapon"))
    return { team: "Armed Response Unit", icon: "🔪" };
  if (type.includes("Pedestrian"))
    return { team: "Ambulance & Traffic Police", icon: "🚑" };
  if (type.includes("Overturn"))
    return { team: "Traffic Police & Recovery", icon: "🚧" };
  if (type.includes("Vehicle Collision"))
    return { team: "Traffic Police & Recovery", icon: "🚗" };
  if (type.includes("Vehicle"))
    return { team: "Traffic Control Room", icon: "🚦" };
  if (type.includes("Fall")) return { team: "Medical / Rescue Team", icon: "🚑" };
  if (type.includes("Intrusion"))
    return { team: "On-site Security Team", icon: "🔒" };
  return { team: "Response Team", icon: "🚨" };
}

/**
 * Per-component contribution to the 0-100 risk score, so the operator can see
 * exactly where the number came from.
 */
export function riskContributions(incident: Incident): Array<{
  label: string;
  weight: number;
  value: number;
  points: number;
  color: string;
}> {
  const rows = [
    {
      label: "Confidence",
      weight: RISK_WEIGHTS.confidence,
      value: incident.confidence ?? 0,
      color: "#58a6ff",
    },
    {
      label: "Seriousness",
      weight: RISK_WEIGHTS.seriousness,
      value: incident.seriousness_score ?? 0,
      color: "#f85149",
    },
    {
      label: "Persistence",
      weight: RISK_WEIGHTS.persistence,
      value: incident.persistence_score ?? 0,
      color: "#d29922",
    },
    {
      label: "Context",
      weight: RISK_WEIGHTS.context,
      value: incident.context_score ?? 0,
      color: "#a371f7",
    },
  ];
  return rows.map((row) => ({
    ...row,
    points: row.weight * row.value * 100,
  }));
}
