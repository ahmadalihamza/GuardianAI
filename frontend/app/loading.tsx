/** Shown while a Server Component page is fetching from the backend. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 max-w-full animate-pulse rounded-md bg-raised" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-44 animate-pulse rounded-lg border border-line bg-raised"
          />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-lg border border-line bg-surface" />
        <div className="h-64 animate-pulse rounded-lg border border-line bg-surface" />
      </div>
      <span className="sr-only">Loading dashboard data…</span>
    </div>
  );
}
