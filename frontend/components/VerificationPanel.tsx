import { EmptyState } from "@/components/Panel";
import { formatDuration, formatRate } from "@/lib/format";
import { ASSESSMENTS } from "@/lib/types";
import type { Statistics } from "@/lib/types";

/**
 * Reviewer analytics: how much of the queue has actually been judged, and how
 * often the detectors were wrong when it was.
 *
 * The false-positive rate deliberately ignores `Unverifiable` — forcing a guess
 * on unreadable footage would make the number look precise while making it
 * meaningless. That exclusion is stated on the card rather than hidden in the
 * backend, because the whole point of the number is that an operator trusts it.
 */

const ASSESSMENT_COLORS: Record<string, string> = {
  "True Positive": "#f43f5e",
  "False Positive": "#64748b",
  Unverifiable: "#f59e0b",
};

export default function VerificationPanel({ stats }: { stats: Statistics }) {
  const { reviewed_count: reviewed, total_incidents: total } = stats;
  const coverage = total > 0 ? reviewed / total : 0;

  const segments = ASSESSMENTS.map((label) => ({
    label,
    value: stats.assessment_distribution[label] ?? 0,
    color: ASSESSMENT_COLORS[label],
  }));
  const judged = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return (
      <EmptyState
        title="Nothing to review yet"
        hint="Reviewer statistics appear once incidents have been recorded."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Headline numbers */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-lg border border-line bg-canvas p-3">
          <p className="text-[0.7rem] font-medium text-muted">False Positives</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-white">
            {formatRate(stats.false_positive_rate)}
          </p>
          <p className="mt-0.5 text-[0.65rem] text-muted">of judged incidents</p>
        </div>
        <div className="rounded-lg border border-line bg-canvas p-3">
          <p className="text-[0.7rem] font-medium text-muted">Mean Time to Review</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-white">
            {formatDuration(stats.mean_seconds_to_review)}
          </p>
          <p className="mt-0.5 text-[0.65rem] text-muted">creation to sign-off</p>
        </div>
        <div className="rounded-lg border border-line bg-canvas p-3">
          <p className="text-[0.7rem] font-medium text-muted">Critical Pending</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${
              stats.critical_pending > 0 ? "text-rose-400" : "text-white"
            }`}
          >
            {stats.critical_pending}
          </p>
          <p className="mt-0.5 text-[0.65rem] text-muted">unreviewed, severe</p>
        </div>
      </div>

      {/* Review coverage */}
      <div>
        <div className="flex items-baseline justify-between text-xs mb-1.5">
          <span className="font-medium text-slate-300">Review coverage</span>
          <span className="font-mono text-muted">
            {reviewed} of {total} ({Math.round(coverage * 100)}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-500"
            style={{ width: `${Math.min(100, coverage * 100)}%` }}
          />
        </div>
      </div>

      {/* Assessment split */}
      <div>
        <span className="mb-1.5 block text-xs font-medium text-slate-300">
          Operator assessments
        </span>
        {judged === 0 ? (
          <p className="rounded-lg border border-dashed border-line/80 p-3 text-center text-[0.7rem] text-muted">
            No incident has been judged yet, so there is no accuracy figure to
            report.
          </p>
        ) : (
          <>
            <div
              role="img"
              aria-label={segments
                .map((segment) => `${segment.label}: ${segment.value}`)
                .join(", ")}
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-raised"
            >
              {segments
                .filter((segment) => segment.value > 0)
                .map((segment) => (
                  <div
                    key={segment.label}
                    style={{
                      width: `${(segment.value / judged) * 100}%`,
                      backgroundColor: segment.color,
                    }}
                  />
                ))}
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {segments.map((segment) => (
                <li
                  key={segment.label}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="flex items-center gap-2 text-slate-300">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: segment.color }}
                    />
                    {segment.label}
                  </span>
                  <span className="font-mono text-muted">
                    {segment.value}
                    {judged > 0
                      ? ` (${Math.round((segment.value / judged) * 100)}%)`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="text-[0.7rem] leading-relaxed text-muted">
        The false-positive rate counts only incidents judged True or False.
        Footage marked <strong className="text-slate-300">Unverifiable</strong> is
        excluded rather than guessed at.
      </p>
    </div>
  );
}
