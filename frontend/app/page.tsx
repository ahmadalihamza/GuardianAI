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
          <div className="flex items-center gap-2">
            <Link
              href="/analyze"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors"
            >
              <VideoIcon size={14} />
              <span>Analyze Video</span>
            </Link>
            <RefreshButton />
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          value={stats.total_incidents}
          label="Total Incidents"
          icon={<ListFilterIcon size={14} />}
          hint="All recorded events"
          badge={`${stats.total_incidents} logged`}
        />
        <MetricCard
          value={stats.pending_verification}
          label="Pending Review"
          icon={<ClockIcon size={14} />}
          status={stats.pending_verification > 0 ? "warn" : "ok"}
          hint="Operator check needed"
          badge={stats.pending_verification > 0 ? "Action needed" : "Up to date"}
        />
        <MetricCard
          value={stats.critical_pending}
          label="Critical Unreviewed"
          icon={<SirenIcon size={14} />}
          status={stats.critical_pending > 0 ? "danger" : "ok"}
          hint="Weapons, fire, collisions"
          badge={stats.critical_pending > 0 ? "Review first" : "Clear"}
        />
        <MetricCard
          value={stats.verified}
          label="Verified"
          icon={<CheckCircleIcon size={14} />}
          status="ok"
          hint="Confirmed threats"
          badge="Validated"
        />
        <MetricCard
          value={stats.high_risk}
          label="High Risk"
          icon={<AlertTriangleIcon size={14} />}
          status={stats.high_risk > 0 ? "danger" : "ok"}
          hint="Score 70 or higher"
          badge={stats.high_risk > 0 ? "Urgent" : "None"}
        />
      </div>

      {/* Analytics Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
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
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Panel
            title="Recent Incidents"
            action={
              incidents.length > 0 ? (
                <Link
                  href="/incidents"
                  className="flex items-center gap-1 text-xs text-blue-400 hover:underline"
                >
                  <span>View all ({incidents.length})</span>
                  <ChevronRightIcon size={12} />
                </Link>
              ) : null
            }
          >
            {recent.length > 0 ? (
              <div className="rounded-lg border border-line divide-y divide-line overflow-hidden bg-canvas">
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
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                  >
                    <VideoIcon size={13} />
                    <span>Upload Video</span>
                  </Link>
                }
              />
            )}
          </Panel>
        </div>

        <div className="lg:col-span-5">
          <Panel title="Verification Quality">
            <VerificationPanel stats={stats} />
          </Panel>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
