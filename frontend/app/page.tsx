import Link from "next/link";
import BarChart from "@/components/BarChart";
import Disclaimer from "@/components/Disclaimer";
import DonutChart, { CATEGORY_COLORS } from "@/components/DonutChart";
import IncidentCard from "@/components/IncidentCard";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import { EmptyState, Panel } from "@/components/Panel";
import RefreshButton from "@/components/RefreshButton";
import VerificationPanel from "@/components/VerificationPanel";
import { getIncidents, getStatistics } from "@/lib/api";
import { eventTheme, severityTheme } from "@/lib/format";
import { SEVERITIES } from "@/lib/types";
import {
  VideoIcon,
  ChevronRightIcon,
  ListFilterIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  SirenIcon,
} from "@/components/Icons";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 5;

export default async function OverviewPage() {
  const [stats, incidents] = await Promise.all([
    getStatistics(),
    getIncidents(),
  ]);

  // Colour each slice by what the event *is*, not by its position in the
  // response, so fire stays orange and traffic stays cyan across reloads.
  const eventSlices = Object.entries(stats.event_type_distribution).map(
    ([label, value], index) => {
      const theme = eventTheme(label);
      return {
        label,
        value,
        color:
          theme.group === "Other"
            ? CATEGORY_COLORS[index % CATEGORY_COLORS.length]
            : theme.hex,
      };
    },
  );

  const severityBars = SEVERITIES.map((severity) => ({
    label: severity,
    value: stats.severity_distribution[severity] ?? 0,
    color: severityTheme(severity).hex,
  }));

  const recent = incidents.slice(0, RECENT_LIMIT);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Overview"
        subtitle="Summary of surveillance activity and detected safety incidents."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/analyze"
              className="inline-flex h-10 w-[140px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md button-primary bg-accent hover:bg-accent-hover px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors"
            >
              <VideoIcon size={18} />
              <span>Analyze Video</span>
            </Link>
            <RefreshButton />
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          value={stats.total_incidents}
          label="Total Incidents"
          icon={<ListFilterIcon size={18} />}
          hint="All recorded events"
          badge={`${stats.total_incidents} logged`}
        />
        <MetricCard
          value={stats.pending_verification}
          label="Pending Review"
          icon={<ClockIcon size={18} />}
          status={stats.pending_verification > 0 ? "warn" : "ok"}
          hint="Operator check needed"
          badge={stats.pending_verification > 0 ? "Action needed" : "Up to date"}
        />
        <MetricCard
          value={stats.critical_pending}
          label="Critical Unreviewed"
          icon={<SirenIcon size={18} />}
          status={stats.critical_pending > 0 ? "danger" : "ok"}
          hint="Weapons, fire, collisions"
          badge={stats.critical_pending > 0 ? "Review first" : "Clear"}
        />
        <MetricCard
          value={stats.verified}
          label="Verified"
          icon={<CheckCircleIcon size={18} />}
          status="ok"
          hint="Confirmed threats"
          badge="Validated"
        />
        <MetricCard
          value={stats.high_risk}
          label="High Risk"
          icon={<AlertTriangleIcon size={18} />}
          status={stats.high_risk > 0 ? "danger" : "ok"}
          hint="Score 70 or higher"
          badge={stats.high_risk > 0 ? "Urgent" : "None"}
        />
      </div>

      {/* Analytics Charts */}
      <div className="workspace-band grid gap-8 xl:grid-cols-2">
        <Panel title="Event Types">
          <DonutChart
            data={eventSlices}
            emptyHint="No incidents recorded yet. Analyze a video to begin."
          />
        </Panel>

        <Panel title="Severity Breakdown">
          <BarChart
            data={severityBars}
            emptyHint="No incidents recorded yet. Analyze a video to begin."
          />
        </Panel>
      </div>

      {/* Recent Incidents & Verification quality */}
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <Panel
            title="Recent Incidents"
            action={
              incidents.length > 0 ? (
                <Link
                  href="/incidents"
                  className="flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  <span>View all ({incidents.length})</span>
                  <ChevronRightIcon size={12} />
                </Link>
              ) : null
            }
          >
            {recent.length > 0 ? (
              <div className="incident-list divide-y divide-line">
                {recent.map((incident) => (
                  <IncidentCard key={incident.id} incident={incident} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No incidents recorded yet"
                hint="Upload a video to test detection and tracking."
                action={
                  <Link
                    href="/analyze"
                    className="inline-flex items-center gap-1.5 rounded-lg button-primary bg-accent hover:bg-accent-hover px-3 py-1.5 text-xs font-medium text-ink transition-colors"
                  >
                    <VideoIcon size={13} />
                    <span>Upload Video</span>
                  </Link>
                }
              />
            )}
          </Panel>
        </div>

        <div className="xl:col-span-5">
          <Panel title="Verification Quality">
            <VerificationPanel stats={stats} />
          </Panel>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
