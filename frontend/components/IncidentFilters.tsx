"use client";

import { useRouter } from "next/navigation";
import { useTransition, useRef } from "react";
import { EVENT_GROUPS, SEVERITIES } from "@/lib/types";
import type { IncidentFilters as Filters } from "@/lib/types";
import { SearchIcon, XIcon } from "@/components/Icons";

const selectClass =
  "h-10 max-w-full rounded-md border border-line bg-surface hover:border-line-strong px-3 text-xs text-ink focus:border-accent focus:outline-accent cursor-pointer transition-colors";

export default function IncidentFilters({
  value,
  resultCount,
}: {
  value: Filters;
  resultCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const hasFilters = Boolean(
    value.event_type || value.severity || value.location || value.status,
  );

  function applyFilter(key: keyof Filters, val?: string) {
    const params = new URLSearchParams();
    const next = { ...value, [key]: val || undefined };
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/incidents?${query}` : "/incidents");
    });
  }

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const loc = String(data.get("location") ?? "").trim();
    applyFilter("location", loc);
  }

  return (
    <div className="flex flex-col items-stretch justify-between gap-4 border-y border-line bg-surface px-3 py-3 xl:flex-row xl:items-center">
      {/* Left: Quick Status Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
        <button
          type="button"
          onClick={() => applyFilter("status", undefined)}
          className={`min-h-10 rounded-md border border-transparent px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
            !value.status
              ? "button-primary bg-accent text-ink shadow-sm"
              : "text-muted hover:text-ink hover:bg-raised"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => applyFilter("status", "Pending Verification")}
          className={`min-h-10 rounded-md border border-transparent px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
            value.status === "Pending Verification"
              ? "bg-warn/10 text-warn border border-warn/40"
              : "text-muted hover:text-ink hover:bg-raised"
          }`}
        >
          Pending Review
        </button>
        <button
          type="button"
          onClick={() => applyFilter("status", "Verified")}
          className={`min-h-10 rounded-md border border-transparent px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
            value.status === "Verified"
              ? "bg-accent/10 text-accent border border-accent/40"
              : "text-muted hover:text-ink hover:bg-raised"
          }`}
        >
          Verified
        </button>
        <button
          type="button"
          onClick={() => applyFilter("status", "Resolved")}
          className={`min-h-10 rounded-md border border-transparent px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
            value.status === "Resolved"
              ? "bg-ok/10 text-ok border border-ok/40"
              : "text-muted hover:text-ink hover:bg-raised"
          }`}
        >
          Resolved
        </button>
      </div>

      {/* Right: Inline Controls & Search */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search bar */}
        <form
          ref={formRef}
          onSubmit={handleSearchSubmit}
          className="relative w-full min-w-[180px] flex-1 sm:w-48"
        >
          <SearchIcon
            size={16}
            className="absolute left-2.5 top-3 text-muted pointer-events-none"
          />
          <input
            type="search"
            aria-label="Search location"
            name="location"
            defaultValue={value.location ?? ""}
            placeholder="Search location..."
            onBlur={(e) => {
              if (e.target.value !== (value.location ?? "")) {
                applyFilter("location", e.target.value.trim());
              }
            }}
            className="h-10 w-full rounded-md border border-line bg-canvas pl-9 pr-3 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-accent"
          />
        </form>

        {/* Event Type Filter — grouped, because there are eleven of them */}
        <select
          aria-label="Event type"
          value={value.event_type ?? ""}
          onChange={(e) => applyFilter("event_type", e.target.value)}
          className={selectClass}
        >
          <option value="">All Events</option>
          {EVENT_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.events.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Severity Filter */}
        <select
          aria-label="Severity"
          value={value.severity ?? ""}
          onChange={(e) => applyFilter("severity", e.target.value)}
          className={selectClass}
        >
          <option value="">All Severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Reset Filter Button */}
        {hasFilters && (
          <button
            type="button"
            onClick={() => startTransition(() => router.push("/incidents"))}
            title="Reset filters"
            aria-label="Reset filters"
            className="h-10 w-10 flex items-center justify-center rounded-md border border-line bg-raised hover:bg-raised-2 text-muted hover:text-ink transition-colors"
          >
            <XIcon size={14} />
          </button>
        )}

        {/* Count Pill */}
        <span className="text-[0.7rem] text-muted font-medium px-2 py-1 bg-surface border border-line rounded-md whitespace-nowrap">
          {pending ? "..." : `${resultCount} item${resultCount === 1 ? "" : "s"}`}
        </span>
      </div>
    </div>
  );
}
