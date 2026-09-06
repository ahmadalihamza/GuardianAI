import { StatusBadge } from "@/components/Badges";
import { EmptyState } from "@/components/Panel";
import { SirenIcon } from "@/components/Icons";
import { assessmentStyle, formatDateTime } from "@/lib/format";
import type { IncidentReview } from "@/lib/types";

/**
 * The append-only review history for one incident, oldest first.
 *
 * Rendered oldest-first on purpose: read top to bottom it is the story of how
 * the incident was handled, including the status transitions, which is exactly
 * what an audit asks for.
 */
export default function ReviewTimeline({
  reviews,
}: {
  reviews: IncidentReview[] | undefined;
}) {
  if (!reviews || reviews.length === 0) {
    return (
      <EmptyState
        title="Not yet reviewed"
        hint="Record a review to start this incident's audit trail."
      />
    );
  }

  return (
    <ol className="space-y-3">
      {reviews.map((review, index) => {
        const moved =
          review.new_status && review.new_status !== review.previous_status;
        return (
          <li
            key={review.id}
            className="relative rounded-lg border border-line bg-canvas p-3 pl-9"
          >
            {/* Step marker + connector */}
            <span className="absolute left-3 top-3.5 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-raised text-[0.6rem] font-mono font-semibold text-slate-300">
              {index + 1}
            </span>
            {index < reviews.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[1.31rem] top-8 bottom-[-0.75rem] w-px bg-line"
              />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-white">
                {review.reviewer}
              </span>
              {review.assessment && (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-medium ${assessmentStyle(
                    review.assessment,
                  )}`}
                >
                  {review.assessment}
                </span>
              )}
              {review.escalated ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[0.7rem] font-medium text-rose-300">
                  <SirenIcon size={11} />
                  Escalated
                </span>
              ) : null}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted">
              {moved ? (
                <>
                  <StatusBadge status={review.previous_status} />
                  <span aria-hidden>→</span>
                  <StatusBadge status={review.new_status} />
                </>
              ) : (
                <>
                  <span>Status held at</span>
                  <StatusBadge status={review.new_status ?? review.previous_status} />
                </>
              )}
            </div>

            {review.notes && (
              <p className="mt-2 border-l-2 border-line pl-2.5 text-xs leading-relaxed text-slate-300">
                {review.notes}
              </p>
            )}

            <p className="mt-2 font-mono text-[0.65rem] text-muted">
              {formatDateTime(review.created_at)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
