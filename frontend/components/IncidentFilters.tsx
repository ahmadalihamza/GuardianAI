"use client";

import { useRouter } from "next/navigation";
import { useTransition, useRef } from "react";
import { EVENT_GROUPS, SEVERITIES } from "@/lib/types";
import type { IncidentFilters as Filters } from "@/lib/types";
import { SearchIcon, XIcon } from "@/components/Icons";

const selectClass =
  "rounded-lg border border-line bg-surface hover:border-slate-600 px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none cursor-pointer transition-colors";

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
    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-2 bg-surface/70 border border-line rounded-xl">
      {/* Left: Quick Status Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
        <button
          type="button"
          onClick={() => applyFilter("status", undefined)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            !value.status
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-raised"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => applyFilter("status", "Pending Verification")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            value.status === "Pending Verification"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "text-slate-400 hover:text-white hover:bg-raised"
          }`}
        >
          Pending Review
        </button>
        <button
          type="button"
          onClick={() => applyFilter("status", "Verified")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            value.status === "Verified"
              ? "bg-blue-600/20 text-blue-300 border border-blue-500/40"
              : "text-slate-400 hover:text-white hover:bg-raised"
          }`}
        >
          Verified
        </button>
        <button
          type="button"
          onClick={() => applyFilter("status", "Resolved")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            value.status === "Resolved"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "text-slate-400 hover:text-white hover:bg-raised"
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
          className="relative flex-1 sm:w-48 lg:w-56"
        >
          <SearchIcon
            size={13}
            className="absolute left-2.5 top-2.5 text-slate-500 pointer-events-none"
          />
          <input
            type="search"
            name="location"
            defaultValue={value.location ?? ""}
            placeholder="Search camera/location..."
            onBlur={(e) => {
              if (e.target.value !== (value.location ?? "")) {
                applyFilter("location", e.target.value.trim());
              }
            }}
            className="w-full rounded-lg border border-line bg-canvas pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </form>

        {/* Event Type Filter — grouped, because there are eleven of them */}
        <select
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
            className="rounded-lg border border-line bg-raised hover:bg-raised-2 p-1.5 text-slate-400 hover:text-white transition-colors"
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
