import type { ReactNode } from "react";

export type MetricStatus = "ok" | "warn" | "danger" | "info";

interface MetricCardProps {
  value: number | string;
  label: string;
  hint?: string;
  badge?: string;
  icon?: ReactNode;
  status?: MetricStatus;
}

export default function MetricCard({
  value,
  label,
  hint,
  badge,
  icon,
  status,
}: MetricCardProps) {
  const statusColor =
    status === "ok"
      ? "bg-emerald-400"
      : status === "warn"
      ? "bg-amber-400"
      : status === "danger"
      ? "bg-rose-500"
      : status === "info"
      ? "bg-blue-400"
      : null;

  return (
    <div className="rounded-xl border border-line bg-surface p-4 flex flex-col justify-between hover:border-slate-700 transition-colors shadow-sm">
      {/* Top Row: Label & Category Icon */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        {icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-canvas border border-line text-slate-400">
            {icon}
          </div>
        )}
      </div>

      {/* Middle & Bottom: Value and Status Details */}
      <div className="mt-3">
        <div className="flex items-center gap-2">
          {statusColor && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusColor} opacity-75`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${statusColor}`} />
            </span>
          )}
          <span className="text-xl font-bold text-white tracking-tight tabular-nums">
            {value}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-line/60 text-[0.7rem] text-muted">
          <span className="truncate">{hint ?? ""}</span>
          {badge && (
            <span className="font-mono text-[0.65rem] font-medium text-slate-300 bg-raised px-1.5 py-0.5 rounded border border-line shrink-0">
              {badge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
