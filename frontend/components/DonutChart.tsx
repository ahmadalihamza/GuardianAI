import { EmptyState } from "@/components/Panel";

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export const CATEGORY_COLORS = [
  "#38bdf8",
  "#f43f5e",
  "#f59e0b",
  "#10b981",
  "#a855f7",
  "#06b6d4",
];

const SIZE = 200;
const THICKNESS = 26;
const RADIUS = (SIZE - THICKNESS) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function DonutChart({
  data,
  emptyHint,
}: {
  data: Slice[];
  emptyHint?: string;
}) {
  const slices = data.filter((slice) => slice.value > 0);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return <EmptyState title="No incident telemetry recorded" hint={emptyHint} />;
  }

  let cumulative = 0;
  const arcs = slices.map((slice) => {
    const fraction = slice.value / total;
    const arc = {
      ...slice,
      fraction,
      dash: fraction * CIRCUMFERENCE,
      offset: -cumulative * CIRCUMFERENCE,
    };
    cumulative += fraction;
    return arc;
  });

  const summary = arcs.map((arc) => `${arc.label}: ${arc.value}`).join(", ");

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-[170px] w-[170px] shrink-0 transform -rotate-90"
          role="img"
          aria-label={`Distribution — ${summary}`}
        >
          {/* Track background */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#1e293b"
            strokeWidth={THICKNESS}
          />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={THICKNESS}
              strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
              strokeDashoffset={arc.offset}
              strokeLinecap="round"
              className="transition-all duration-500 ease-out"
            />
          ))}
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-extrabold text-white tracking-tight tabular-nums">
            {total}
          </span>
          <span className="text-[0.65rem] font-bold uppercase tracking-widest text-muted">
            EVENTS
          </span>
        </div>
      </div>

      <ul className="w-full space-y-2.5">
        {arcs.map((arc) => (
          <li
            key={arc.label}
            className="flex items-center justify-between text-xs rounded-lg bg-surface/50 border border-line/40 px-3 py-2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
                style={{ backgroundColor: arc.color }}
              />
              <span className="truncate font-medium text-slate-200">
                {arc.label}
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-white font-bold">{arc.value}</span>
              <span className="text-[0.65rem] text-muted">
                ({Math.round(arc.fraction * 100)}%)
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
