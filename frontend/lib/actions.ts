"use server";

import { revalidatePath } from "next/cache";

import { reviewIncident, updateIncidentStatus } from "@/lib/api";
import { ASSESSMENTS, STATUSES } from "@/lib/types";
import { isValidIncidentId } from "@/lib/samples";

export interface StatusActionResult {
  success: boolean;
  status?: string;
  error?: string;
}

/**
 * Human-in-the-loop verification step: the operator moves an incident between
 * Pending / Verified / Dismissed / Resolved.
 *
 * Server Action arguments arrive from the browser, so the status is checked
 * against the allowed set here as well as in the backend.
 */
export async function setIncidentStatus(
  incidentId: number,
  status: string,
): Promise<StatusActionResult> {
  if (!isValidIncidentId(incidentId)) {
    return { success: false, error: "Invalid incident id" };
  }
  if (!(STATUSES as readonly string[]).includes(status)) {
    return { success: false, error: `Unsupported status: ${status}` };
  }

  const result = await updateIncidentStatus(incidentId, status);

  if (result.success) {
    // Statistics, the incident list and the detail view all change.
    revalidatePath("/");
    revalidatePath("/incidents");
    revalidatePath(`/incidents/${incidentId}`);
  }

  return result;
}

export interface ReviewActionResult {
  success: boolean;
  status?: string;
  error?: string;
}

const MAX_NOTES = 4000;

/**
 * The full verification step: who reviewed it, whether the detector was right,
 * free-text notes and whether it was escalated. Unlike `setIncidentStatus` this
 * also appends an audit row, so it is the path used when an operator is
 * actually signing off on an incident rather than just re-filing it.
 *
 * Everything here arrives from the browser, so each enum is re-checked against
 * the allowed set even though the backend checks them too.
 */
export async function submitReview(input: {
  incidentId: number;
  reviewer: string;
  status?: string;
  assessment?: string;
  notes?: string;
  escalated?: boolean;
}): Promise<ReviewActionResult> {
  const { incidentId } = input;
  if (!isValidIncidentId(incidentId)) {
    return { success: false, error: "Invalid incident id" };
  }

  const reviewer = (input.reviewer ?? "").trim();
  if (!reviewer) {
    return { success: false, error: "Enter your name or operator ID first." };
  }
  if (reviewer.length > 120) {
    return { success: false, error: "Reviewer name is too long (max 120)." };
  }

  const status = input.status?.trim() || undefined;
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return { success: false, error: `Unsupported status: ${status}` };
  }

  const assessment = input.assessment?.trim() || undefined;
  if (assessment && !(ASSESSMENTS as readonly string[]).includes(assessment)) {
    return { success: false, error: `Unsupported assessment: ${assessment}` };
  }

  const notes = input.notes?.trim() || undefined;
  if (notes && notes.length > MAX_NOTES) {
    return {
      success: false,
      error: `Notes are too long (${notes.length}/${MAX_NOTES} characters).`,
    };
  }

  if (!status && !assessment && !notes && !input.escalated) {
    return { success: false, error: "Nothing to record — add a decision or a note." };
  }

  const result = await reviewIncident(incidentId, {
    reviewer,
    status: status ?? null,
    assessment: assessment ?? null,
    notes: notes ?? null,
    escalated: Boolean(input.escalated),
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  revalidatePath("/");
  revalidatePath("/incidents");
  revalidatePath(`/incidents/${incidentId}`);

  return { success: true, status: result.incident?.status };
}
