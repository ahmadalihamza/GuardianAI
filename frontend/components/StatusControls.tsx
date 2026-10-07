"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setIncidentStatus } from "@/lib/actions";
import { CheckCircleIcon, XCircleIcon, ShieldIcon, RefreshIcon } from "@/components/Icons";

const ACTIONS = [
  {
    status: "Verified",
    label: "Verify as Valid Threat",
    icon: CheckCircleIcon,
    classes: "border-accent/40 bg-accent/10 text-accent hover:bg-accent/10 hover:border-accent/60 shadow-sm",
  },
  {
    status: "Dismissed",
    label: "Dismiss as False Alarm",
    icon: XCircleIcon,
    classes: "border-line-strong bg-raised/60 text-ink hover:bg-danger/10 hover:border-danger/40 hover:text-danger",
  },
  {
    status: "Resolved",
    label: "Resolve & Close Incident",
    icon: ShieldIcon,
    classes: "border-ok/40 bg-ok/10 text-ok hover:bg-ok/10 hover:border-ok/60 shadow-sm",
  },
] as const;

export default function StatusControls({
  incidentId,
  currentStatus,
}: {
  incidentId: number;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  function apply(status: string) {
    setBusy(status);
    setMessage(null);
    startTransition(async () => {
      const result = await setIncidentStatus(incidentId, status);
      setBusy(null);
      if (result.success) {
        setMessage({ kind: "ok", text: `Incident status updated to: ${status}` });
        router.refresh();
      } else {
        setMessage({
          kind: "error",
          text: result.error ?? "Could not update the incident.",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {ACTIONS.map((action) => {
          const isCurrent = currentStatus === action.status;
          const Icon = action.icon;
          return (
            <button
              key={action.status}
              type="button"
              onClick={() => apply(action.status)}
              disabled={pending || isCurrent}
              aria-label={
                isCurrent
                  ? `${action.label} (currently ${action.status})`
                  : action.label
              }
              className={`inline-flex items-center justify-center gap-2 rounded-lg border p-3 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 ${action.classes}`}
            >
              {busy === action.status ? (
                <RefreshIcon size={14} className="animate-spin" />
              ) : (
                <Icon size={15} />
              )}
              <span>{busy === action.status ? "Saving..." : action.label}</span>
            </button>
          );
        })}
      </div>

      {message ? (
        <div
          aria-live="polite"
          className={`flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold ${
            message.kind === "ok"
              ? "border-ok/40 bg-ok/10 text-ok"
              : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {message.kind === "ok" ? (
            <CheckCircleIcon size={16} className="text-ok" />
          ) : (
            <XCircleIcon size={16} className="text-danger" />
          )}
          <span>{message.text}</span>
        </div>
      ) : null}
    </div>
  );
}
