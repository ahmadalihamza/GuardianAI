import { severityTheme, statusStyle } from "@/lib/format";

export function SeverityBadge({
  severity,
}: {
  severity: string | null | undefined;
}) {
  const theme = severityTheme(severity);

  return (
    <span
      className={`status-pill inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-semibold ${theme.pill}`}
    >
      {severity ?? "Unknown"}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <span
      className={`status-pill inline-flex items-center rounded-md border px-2.5 py-0.5 text-[11px] font-semibold ${statusStyle(
        status,
      )}`}
    >
      {status ?? "Unknown"}
    </span>
  );
}

export function RiskBadge({ score }: { score: number | null | undefined }) {
  const num = score ?? 0;
  const color =
    num >= 70
      ? "text-danger bg-danger/10 border-danger/20"
      : num >= 40
      ? "text-warn bg-warn/10 border-warn/20"
      : "text-ok bg-ok/10 border-ok/20";

  return (
    <span
      className={`inline-flex items-baseline gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded border ${color}`}
    >
      <span>{score ?? "—"}</span>
      <span className="text-[0.65rem] opacity-70">/100</span>
    </span>
  );
}
