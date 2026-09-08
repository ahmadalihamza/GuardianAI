/**
 * Server-side client for the GuardianAI FastAPI backend.
 *
 * This is the TypeScript counterpart of the old `frontend/api_client.py`. Every
 * function degrades gracefully to an empty/default value instead of throwing,
 * so a dashboard page still renders when the backend is down — the sidebar
 * health indicator is what tells the operator something is wrong.
 *
 * Only ever imported from Server Components, Server Actions and Route
 * Handlers; `BACKEND_URL` is deliberately not a NEXT_PUBLIC_* variable.
 */
import type {
  HealthStatus,
  Incident,
  IncidentFilters,
  IncidentReview,
  Statistics,
} from "./types";
import { EMPTY_STATISTICS, UNREACHABLE_HEALTH } from "./types";
import { getSampleIncident } from "./samples";

export const BACKEND_URL = (
  process.env.BACKEND_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

/** Short timeout for dashboard reads; video analysis uses its own budget. */
const READ_TIMEOUT_MS = 10_000;

async function backendFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = READ_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      signal: controller.signal,
      // Incident data is operational state — never serve it from a cache.
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHealth(): Promise<HealthStatus> {
  try {
    const res = await backendFetch("/health", {}, 5_000);
    if (!res.ok) {
      return { ...UNREACHABLE_HEALTH, status: "unhealthy" };
    }
    return (await res.json()) as HealthStatus;
  } catch {
    return UNREACHABLE_HEALTH;
  }
}

export async function getStatistics(): Promise<Statistics> {
  try {
    const res = await backendFetch("/api/statistics");
    if (!res.ok) return EMPTY_STATISTICS;
    const data = (await res.json()) as unknown;
    if (data && typeof data === "object") {
      return { ...EMPTY_STATISTICS, ...(data as Statistics) };
    }
    return EMPTY_STATISTICS;
  } catch {
    return EMPTY_STATISTICS;
  }
}

export async function getIncidents(
  filters: IncidentFilters = {},
): Promise<Incident[]> {
  const params = new URLSearchParams();
  for (const key of ["event_type", "severity", "status", "location"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  try {
    const res = await backendFetch(`/api/incidents${query ? `?${query}` : ""}`);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as Incident[]) : [];
  } catch {
    return [];
  }
}

export async function getIncident(id: number): Promise<Incident | null> {
  const saved = getSampleIncident(id);
  const fallback = saved ? { ...saved, review_state_unavailable: true } : null;
  try {
    const res = await backendFetch(`/api/incidents/${id}`, {}, saved ? 2_000 : READ_TIMEOUT_MS);
    if (!res.ok) return fallback;
    return (await res.json()) as Incident;
  } catch {
    return fallback;
  }
}

export interface StatusUpdateResult {
  success: boolean;
  status?: string;
  error?: string;
}

/** Pulls a `detail` out of a FastAPI error body, falling back to the code. */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body?.detail === "string" && body.detail) return body.detail;
  } catch {
    /* non-JSON error body — keep the status code */
  }
  return `HTTP ${res.status}`;
}

export async function updateIncidentStatus(
  id: number,
  status: string,
): Promise<StatusUpdateResult> {
  try {
    const res = await backendFetch(`/api/incidents/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      return (await res.json()) as StatusUpdateResult;
    }
    return { success: false, error: await errorDetail(res) };
  } catch {
    return { success: false, error: "Could not reach the backend" };
  }
}

export interface ReviewPayload {
  reviewer: string;
  status?: string | null;
  assessment?: string | null;
  notes?: string | null;
  escalated?: boolean;
}

export interface ReviewResult {
  success: boolean;
  incident?: Incident;
  error?: string;
}

/**
 * Records one operator verification. The backend both updates the incident and
 * appends an immutable row to `incident_reviews`, so a single call is the whole
 * transaction — the client never has to keep the two in step.
 */
export async function reviewIncident(
  id: number,
  payload: ReviewPayload,
): Promise<ReviewResult> {
  try {
    const res = await backendFetch(`/api/incidents/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return { success: true, incident: (await res.json()) as Incident };
    }
    return { success: false, error: await errorDetail(res) };
  } catch {
    return { success: false, error: "Could not reach the backend" };
  }
}

export async function getIncidentReviews(
  id: number,
): Promise<IncidentReview[]> {
  try {
    const res = await backendFetch(`/api/incidents/${id}/reviews`);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as IncidentReview[]) : [];
  } catch {
    return [];
  }
}
