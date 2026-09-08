import manifest from "@/public/samples/manifest.json";
import type { AnalyzeResult, Incident } from "./types";

export interface PreparedSample {
  id: string;
  title: string;
  filename: string;
  duration_seconds: number;
  video_url: string;
  poster_url: string;
  result: AnalyzeResult;
}

export const PREPARED_SAMPLES: PreparedSample[] = manifest;

export function isValidIncidentId(id: number): boolean {
  return Number.isSafeInteger(id) && (id > 0 || getSampleIncident(id) !== null);
}

export function getSampleIncident(id: number): Incident | null {
  if (id >= 0) return null;
  for (const sample of PREPARED_SAMPLES) {
    const incident = sample.result.incidents?.find((row) => row.id === id);
    if (incident) return incident;
  }
  return null;
}
