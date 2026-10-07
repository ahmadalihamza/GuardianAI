"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshIcon, CheckCircleIcon } from "@/components/Icons";

export default function RefreshButton({
  label = "Refresh Feed",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(false);

  async function handleRefresh() {
    if (loading) return;
    setLoading(true);
    setUpdated(false);

    try {
      // 1. Trigger Next.js App Router server component re-fetch
      router.refresh();

      // 2. Sync health check
      void fetch("/api/health", { cache: "no-store" }).catch(() => {});

      // 3. Keep animation visible for at least 700ms so the user perceives the action
      await new Promise((resolve) => setTimeout(resolve, 700));

      // 4. Show success confirmation badge
      setUpdated(true);
      setTimeout(() => setUpdated(false), 2000);
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleRefresh}
      className={`inline-flex h-10 w-[130px] shrink-0 items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-xs font-medium transition-all duration-200 active:scale-95 shadow-sm ${
        updated
          ? "border-ok/50 bg-ok/10 text-ok"
          : "border-line bg-raised hover:bg-raised-2 text-ink hover:text-ink hover:border-line-strong"
      }`}
      title="Fetch latest surveillance records from server"
    >
      {updated ? (
        <CheckCircleIcon size={14} className="text-ok" />
      ) : (
        <RefreshIcon
          size={14}
          className={`text-accent transition-transform ${
            loading ? "animate-spin" : ""
          }`}
        />
      )}
      <span className="whitespace-nowrap">
        {loading ? "Refreshing..." : updated ? "Updated" : label}
      </span>
    </button>
  );
}
