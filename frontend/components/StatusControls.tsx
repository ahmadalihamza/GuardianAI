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
    classes: "border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 hover:border-sky-500/60 shadow-sm",
  },
  {
    status: "Dismissed",
    label: "Dismiss as False Alarm",
    icon: XCircleIcon,
    classes: "border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-rose-500/15 hover:border-rose-500/40 hover:text-rose-300",
  },
  {
    status: "Resolved",
    label: "Resolve & Close Incident",
    icon: ShieldIcon,
    classes: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-500/60 shadow-sm",
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
              className={`inline-flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 ${action.classes}`}
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
          className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${
            message.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/40 bg-rose-500/10 text-rose-300"
          }`}
        >
          {message.kind === "ok" ? (
            <CheckCircleIcon size={16} className="text-emerald-400" />
          ) : (
            <XCircleIcon size={16} className="text-rose-400" />
          )}
          <span>{message.text}</span>
        </div>
      ) : null}
    </div>
  );
}
