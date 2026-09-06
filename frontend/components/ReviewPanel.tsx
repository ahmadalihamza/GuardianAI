"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitReview } from "@/lib/actions";
import { ASSESSMENTS, STATUSES } from "@/lib/types";
import {
  CheckCircleIcon,
  RefreshIcon,
  SirenIcon,
  UserIcon,
  XCircleIcon,
} from "@/components/Icons";

/**
 * The operator sign-off form.
 *
 * `StatusControls` re-files an incident in one click; this records a judgement:
 * who looked at it, whether the detector was right, and why. Those three
 * together are what make the false-positive rate on the overview page mean
 * anything, so the assessment is the field the layout leads with.
 */

const REVIEWER_KEY = "guardianai.reviewer";

const ASSESSMENT_COPY: Record<
  string,
  { blurb: string; classes: string; active: string }
> = {
  "True Positive": {
    blurb: "The detector was right — this really happened.",
    classes: "border-rose-500/30 bg-rose-500/5 text-rose-200 hover:bg-rose-500/10",
    active: "border-rose-500 bg-rose-500/20 text-rose-100 ring-1 ring-rose-500/40",
  },
  "False Positive": {
    blurb: "The detector was wrong — nothing happened here.",
    classes:
      "border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800/70",
    active:
      "border-slate-400 bg-slate-700/60 text-white ring-1 ring-slate-400/40",
  },
  Unverifiable: {
    blurb: "The footage does not settle it either way.",
    classes:
      "border-amber-500/30 bg-amber-500/5 text-amber-200 hover:bg-amber-500/10",
    active:
      "border-amber-500 bg-amber-500/20 text-amber-100 ring-1 ring-amber-500/40",
  },
};

/** Assessment → the status an operator almost always wants alongside it. */
const SUGGESTED_STATUS: Record<string, string> = {
  "True Positive": "Verified",
  "False Positive": "Dismissed",
  Unverifiable: "Pending Verification",
};

const MAX_NOTES = 4000;

export default function ReviewPanel({
  incidentId,
  currentStatus,
  lastReviewer,
}: {
  incidentId: number;
  currentStatus: string;
  lastReviewer?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [reviewer, setReviewer] = useState(lastReviewer ?? "");
  const [assessment, setAssessment] = useState("");
  const [status, setStatus] = useState(currentStatus);
  const [notes, setNotes] = useState("");
  const [escalated, setEscalated] = useState(false);
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  // An operator reviews a queue, not one incident. Remembering the name across
  // navigations is the difference between one keystroke and thirty.
  useEffect(() => {
    if (reviewer) return;
    try {
      const saved = window.localStorage.getItem(REVIEWER_KEY);
      if (saved) setReviewer(saved);
    } catch {
      /* private browsing or storage disabled — the field just starts empty */
    }
  }, [reviewer]);

  function pickAssessment(value: string) {
    const next = assessment === value ? "" : value;
    setAssessment(next);
    setMessage(null);
    // Only pre-fill the status while it is still untouched at its current value,
    // so an explicit choice is never silently overwritten.
    if (next && status === currentStatus) {
      setStatus(SUGGESTED_STATUS[next] ?? currentStatus);
    }
  }

  function save() {
    setMessage(null);
    const name = reviewer.trim();
    if (!name) {
      setMessage({ kind: "error", text: "Enter your name or operator ID first." });
      return;
    }
    try {
      window.localStorage.setItem(REVIEWER_KEY, name);
    } catch {
      /* non-fatal */
    }

    startTransition(async () => {
      const result = await submitReview({
        incidentId,
        reviewer: name,
        status: status === currentStatus ? undefined : status,
        assessment: assessment || undefined,
        notes: notes || undefined,
        escalated,
      });
      if (result.success) {
        setMessage({
          kind: "ok",
          text: `Review recorded${result.status ? ` — status is now ${result.status}` : ""}.`,
        });
        setNotes("");
        setEscalated(false);
        router.refresh();
      } else {
        setMessage({
          kind: "error",
          text: result.error ?? "Could not record the review.",
        });
      }
    });
  }

  const statusChanged = status !== currentStatus;

  return (
    <div className="space-y-4">
      {/* Reviewer identity */}
      <div>
        <label
          htmlFor="reviewer"
          className="text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5"
        >
          <UserIcon size={13} className="text-slate-400" />
          Reviewer
        </label>
        <input
          id="reviewer"
          type="text"
          value={reviewer}
          maxLength={120}
          disabled={pending}
          onChange={(e) => setReviewer(e.target.value)}
          placeholder="Name or operator ID"
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Assessment — was the detector right? */}
      <fieldset>
        <legend className="text-xs font-medium text-slate-300 mb-1.5">
          Was this detection correct?
        </legend>
        <div className="grid gap-2">
          {ASSESSMENTS.map((option) => {
            const copy = ASSESSMENT_COPY[option];
            const selected = assessment === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                disabled={pending}
                onClick={() => pickAssessment(option)}
                className={`rounded-lg border px-3 py-2 text-left transition-all disabled:opacity-50 ${
                  selected ? copy.active : copy.classes
                }`}
              >
                <span className="block text-xs font-semibold">{option}</span>
                <span className="block text-[0.7rem] opacity-80">
                  {copy.blurb}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Resulting status */}
      <div>
        <label
          htmlFor="review-status"
          className="text-xs font-medium text-slate-300 block mb-1"
        >
          Set status
        </label>
        <select
          id="review-status"
          value={status}
          disabled={pending}
          onChange={(e) => {
            setStatus(e.target.value);
            setMessage(null);
          }}
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
        >
          {STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
              {option === currentStatus ? " (current)" : ""}
            </option>
          ))}
        </select>
        {!statusChanged && (
          <p className="mt-1 text-[0.7rem] text-muted">
            Unchanged — the review is still logged against the current status.
          </p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="review-notes"
          className="text-xs font-medium text-slate-300 flex items-center justify-between mb-1"
        >
          <span>Notes</span>
          <span className="font-mono text-[0.7rem] text-muted">
            {notes.length}/{MAX_NOTES}
          </span>
        </label>
        <textarea
          id="review-notes"
          value={notes}
          rows={3}
          maxLength={MAX_NOTES}
          disabled={pending}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What you saw in the footage, and anything the next reviewer should know."
          className="w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Escalation */}
      <label
        className={`flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
          escalated
            ? "border-rose-500/40 bg-rose-500/10"
            : "border-line bg-canvas hover:bg-raised/40"
        }`}
      >
        <span className="flex items-start gap-2.5">
          <SirenIcon
            size={15}
            className={escalated ? "text-rose-400" : "text-slate-400"}
          />
          <span>
            <span className="block text-xs font-medium text-white">
              Escalate to a supervisor
            </span>
            <span className="block text-[0.7rem] text-muted">
              Marks the incident as needing attention beyond this review.
            </span>
          </span>
        </span>
        <input
          type="checkbox"
          checked={escalated}
          disabled={pending}
          onChange={(e) => setEscalated(e.target.checked)}
          className="h-4 w-4 shrink-0 rounded accent-rose-600"
        />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:pointer-events-none"
      >
        {pending ? (
          <RefreshIcon size={15} className="animate-spin" />
        ) : (
          <CheckCircleIcon size={15} />
        )}
        <span>{pending ? "Recording..." : "Record Review"}</span>
      </button>

      {message ? (
        <div
          aria-live="polite"
          className={`flex items-center gap-2 rounded-lg border p-3 text-xs font-medium ${
            message.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/40 bg-rose-500/10 text-rose-300"
          }`}
        >
          {message.kind === "ok" ? (
            <CheckCircleIcon size={15} className="text-emerald-400 shrink-0" />
          ) : (
            <XCircleIcon size={15} className="text-rose-400 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      ) : null}

      <p className="text-[0.7rem] text-muted leading-relaxed">
        Reviews are append-only. Recording a new one never rewrites an earlier
        entry, so the history below stays a faithful audit trail.
      </p>
    </div>
  );
}
