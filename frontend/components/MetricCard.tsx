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

export default function MetricCard({ value, label, hint, badge, icon, status }: MetricCardProps) {
  return (
    <div className="metric-card grid grid-rows-[40px_44px_auto] gap-2" data-tone={status ?? "neutral"}>
      <div className="flex items-start justify-between gap-2">
        <span className="pt-1 text-[12px] font-semibold leading-snug text-muted">{label}</span>
        {icon && <span className="metric-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-md">{icon}</span>}
      </div>
      <div className={`break-words font-bold leading-tight tabular-nums text-ink ${typeof value === "string" ? (value.length > 10 ? "text-[16px]" : "text-[20px]") : "text-[32px]"}`}>{value}</div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        {hint && <span className="text-[11px] leading-relaxed text-muted">{hint}</span>}
        {badge && <span className="metric-badge">{badge}</span>}
      </div>
    </div>
  );
}
