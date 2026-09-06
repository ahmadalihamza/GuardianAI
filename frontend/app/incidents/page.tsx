import Link from "next/link";
import IncidentCard from "@/components/IncidentCard";
import IncidentFilters from "@/components/IncidentFilters";
import PageHeader from "@/components/PageHeader";
import { EmptyState } from "@/components/Panel";
import RefreshButton from "@/components/RefreshButton";
import { getIncidents } from "@/lib/api";
import type { IncidentFilters as Filters } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Incidents — GuardianAI",
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters: Filters = {
    event_type: one(params.event_type),
    severity: one(params.severity),
    status: one(params.status),
    location: one(params.location),
  };

  const incidents = await getIncidents(filters);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Incidents"
        subtitle="Review, verify, and resolve detected surveillance events."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/analyze"
              className="rounded-lg border border-line bg-raised hover:bg-raised-2 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors"
            >
              Analyze Video
            </Link>
            <RefreshButton />
          </div>
        }
      />

      {/* Concise Toolbar */}
      <IncidentFilters value={filters} resultCount={incidents.length} />

      {/* Unified High-Density Incident List */}
      {incidents.length > 0 ? (
        <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden shadow-sm">
          {incidents.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-6">
          <EmptyState
            title={
              hasFilters
                ? "No incidents match the active filters"
                : "No incidents recorded yet"
            }
            hint={
              hasFilters
                ? "Try adjusting your search criteria or clear the filters."
                : "Upload a surveillance video to begin detecting events."
            }
            action={
              hasFilters ? (
                <Link
                  href="/incidents"
                  className="inline-flex items-center gap-2 rounded-lg bg-raised border border-line px-3.5 py-1.5 text-xs font-medium text-blue-400 hover:text-white transition-colors"
                >
                  Clear Filters
                </Link>
              ) : (
                <Link
                  href="/analyze"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-medium text-white transition-colors"
                >
                  Upload Video
                </Link>
              )
            }
          />
        </div>
      )}
    </div>
  );
}
