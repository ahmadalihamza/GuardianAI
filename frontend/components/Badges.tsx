import { severityTheme, statusStyle } from "@/lib/format";

export function SeverityBadge({
  severity,
}: {
  severity: string | null | undefined;
}) {
  const theme = severityTheme(severity);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${theme.pill}`}
    >
      {severity ?? "Unknown"}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyle(
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
      ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
      : num >= 40
      ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
      : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";

  return (
    <span
      className={`inline-flex items-baseline gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded border ${color}`}
    >
      <span>{score ?? "—"}</span>
      <span className="text-[0.65rem] opacity-70">/100</span>
    </span>
  );
}
