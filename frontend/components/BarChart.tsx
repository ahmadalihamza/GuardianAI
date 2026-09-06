import { EmptyState } from "@/components/Panel";

export interface Bar {
  label: string;
  value: number;
  color: string;
}

const CHART_HEIGHT = 170;

export default function BarChart({
  data,
  emptyHint,
}: {
  data: Bar[];
  emptyHint?: string;
}) {
  const bars = data.filter((bar) => bar.value > 0);
  const total = bars.reduce((sum, bar) => sum + bar.value, 0);

  if (total === 0) {
    return <EmptyState title="No incident telemetry recorded" hint={emptyHint} />;
  }

  const max = Math.max(...bars.map((bar) => bar.value));
  const summary = bars.map((bar) => `${bar.label}: ${bar.value}`).join(", ");

  return (
    <div role="img" aria-label={`Distribution — ${summary}`} className="w-full">
      <div
        className="flex items-end justify-around gap-6 border-b border-line/60 px-4"
        style={{ height: CHART_HEIGHT }}
      >
        {bars.map((bar) => {
          const pct = Math.max((bar.value / max) * 100, 8);
          return (
            <div
              key={bar.label}
              className="flex h-full max-w-28 flex-1 flex-col items-center justify-end gap-2 group"
            >
              <span className="font-mono text-xs font-bold text-slate-200 tabular-nums">
                {bar.value}
              </span>
              <div
                className="w-full rounded-t-md transition-all duration-500 ease-out group-hover:brightness-110 shadow-lg"
                style={{
                  height: `${pct}%`,
                  backgroundColor: bar.color,
                  boxShadow: `0 0 15px -3px ${bar.color}40`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-start justify-around gap-6 px-4 pt-3">
        {bars.map((bar) => (
          <span
            key={bar.label}
            className="max-w-28 flex-1 text-center text-xs font-semibold uppercase tracking-wider text-slate-400"
          >
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}
