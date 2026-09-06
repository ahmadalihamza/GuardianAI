"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. Server-side details are redacted by Next in
 * production, so the message shown here is deliberately generic.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("GuardianAI dashboard error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-danger/60 bg-danger/5 px-6 py-8 text-center">
      <p aria-hidden className="text-3xl">
        ⚠️
      </p>
      <h1 className="mt-3 text-lg font-semibold text-ink">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-muted">
        The dashboard could not render this page. If the GuardianAI backend is
        not running on port 8000, start it and try again.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted/80">
          digest {error.digest}
        </p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-md bg-action px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-action-hover"
      >
        Try again
      </button>
    </div>
  );
}
