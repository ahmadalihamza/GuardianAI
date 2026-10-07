import { EmptyState } from "@/components/Panel";

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export const CATEGORY_COLORS = [
  "#609f90",
  "#dc6259",
  "#cf9d40",
  "#269474",
  "#937096",
  "#168578",
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
            stroke="#e4ece6"
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
          <span className="text-3xl font-extrabold text-ink tracking-normal tabular-nums">
            {total}
          </span>
          <span className="text-[0.65rem] font-bold uppercase tracking-normal text-muted">
            EVENTS
          </span>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-1">
        {arcs.map((arc) => (
          <li
            key={arc.label}
            className="flex items-center justify-between gap-3 border-b border-line py-3 text-xs last:border-0"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
                style={{ backgroundColor: arc.color }}
              />
              <span className="break-words font-medium text-ink">
                {arc.label}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 font-mono">
              <span className="text-ink font-bold">{arc.value}</span>
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
