import Link from "next/link";
import { notFound } from "next/navigation";
import AlertBox from "@/components/AlertBox";
import { SeverityBadge, StatusBadge } from "@/components/Badges";
import DispatchPanel from "@/components/DispatchPanel";
import IncidentMediaViewer from "@/components/IncidentMediaViewer";
import PageHeader from "@/components/PageHeader";
import { Field, Panel } from "@/components/Panel";
import RefreshButton from "@/components/RefreshButton";
import ReviewPanel from "@/components/ReviewPanel";
import ReviewTimeline from "@/components/ReviewTimeline";
import StatusControls from "@/components/StatusControls";
import { getIncident } from "@/lib/api";
import {
  RISK_FORMULA,
  assessmentStyle,
  detectionMethod,
  eventTheme,
  formatDateTime,
  formatPercent,
  formatScore,
  formatVideoTime,
  mediaUrl,
  parseBbox,
  riskContributions,
} from "@/lib/format";
import { CRITICAL_EVENT_TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const parsed = parseId(id);
  const incident = parsed === null ? null : await getIncident(parsed);
  return {
    title: incident
      ? `${incident.incident_code} — GuardianAI`
      : "Incident Details — GuardianAI",
  };
}

export default async function IncidentDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const parsed = parseId(id);
  if (parsed === null) notFound();

  const incident = await getIncident(parsed);
  if (!incident) notFound();

  const contributions = riskContributions(incident);
  const evidence = mediaUrl("evidence", incident.evidence_path);
  const processed = mediaUrl("processed", incident.processed_video_path);
  const maxPoints = Math.max(...contributions.map((row) => row.weight * 100));

  const theme = eventTheme(incident.event_type);
  const method = detectionMethod(incident.detection_method);
  const box = parseBbox(incident.bbox);
  const isCritical = CRITICAL_EVENT_TYPES.includes(incident.event_type);
  // Region events (fire, smoke) and vehicle events carry no person track, so
  // the backend stores -1. Printing "Person #-1" would be nonsense.
  const hasSubject =
    incident.person_track_id !== null &&
    incident.person_track_id !== undefined &&
    incident.person_track_id >= 0;
  const reviews = incident.reviews ?? [];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/incidents"
          className="text-xs font-medium text-muted hover:text-white transition-colors"
        >
          ← Back to Incidents
        </Link>
      </div>

      {/* Header */}
      <PageHeader
        title={incident.incident_code}
        subtitle={`${incident.event_type} · ${theme.group} · Recorded on ${formatDateTime(incident.created_at)}`}
        actions={<RefreshButton />}
      />

      {/* Alert banner */}
      <AlertBox severity={incident.severity}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span aria-hidden className="text-base leading-none">
              {theme.glyph}
            </span>
            <span className="text-sm font-semibold text-white">
              {incident.event_type}
            </span>
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            {isCritical && (
              <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-300">
                Critical event type
              </span>
            )}
            {incident.escalated ? (
              <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-200">
                Escalated
              </span>
            ) : null}
          </div>
          <div className="text-xs font-mono text-slate-300">
            Risk Score:{" "}
            <strong className="text-white text-sm">
              {incident.risk_score ?? "—"}
            </strong>{" "}
            / 100
          </div>
        </div>
      </AlertBox>

      {/* Visual media viewer with graceful error handling */}
      <IncidentMediaViewer
        evidenceUrl={evidence}
        videoUrl={processed}
        incidentCode={incident.incident_code}
      />

      {/* Details & Risk score */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column: fields & explanation (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <Panel title="Incident Information">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Camera">
                {incident.camera_name ?? "Camera 01"}
              </Field>
              <Field label="Location">{incident.location ?? "Main Area"}</Field>
              <Field label={hasSubject ? "Track ID" : "Subject"} mono={hasSubject}>
                {hasSubject ? `#${incident.person_track_id}` : "Region event"}
              </Field>
              <Field label="Video Timestamp" mono>
                {formatVideoTime(incident.video_timestamp)} (
                {(incident.video_timestamp ?? 0).toFixed(1)}s)
              </Field>
              <Field label="Detection Confidence" mono>
                {formatPercent(incident.confidence)}
              </Field>
              <Field label="Status">
                <StatusBadge status={incident.status} />
              </Field>
              <Field label="Detection Method">{method.label}</Field>
              <Field label="Event Box" mono>
                {box
                  ? `${Math.round(box.x2 - box.x1)} × ${Math.round(box.y2 - box.y1)} px`
                  : "—"}
              </Field>
              <Field label="Source Video" mono>
                {incident.source_video ?? "Upload"}
              </Field>
              <Field label="Created At" mono>
                {formatDateTime(incident.created_at)}
              </Field>
              <Field label="Last Updated" mono>
                {formatDateTime(incident.updated_at)}
              </Field>
              <Field label="Reviewed By">
                {incident.reviewed_by ?? "Not yet reviewed"}
              </Field>
            </dl>

            <p className="mt-3 rounded-lg bg-canvas border border-line/60 p-2.5 text-[0.7rem] text-muted leading-relaxed">
              <strong className="text-slate-300">{method.label}:</strong>{" "}
              {method.detail}
              {box
                ? ` Box at (${Math.round(box.x1)}, ${Math.round(box.y1)}) → (${Math.round(box.x2)}, ${Math.round(box.y2)}) in the source frame.`
                : ""}
            </p>
          </Panel>

          <Panel title="Incident Description">
            <p className="text-sm text-slate-300 leading-relaxed">
              {incident.explanation ??
                "No description available for this incident."}
            </p>
            {incident.ai_summary && (
              <div className="mt-3 pt-3 border-t border-line text-xs text-muted leading-relaxed">
                <strong className="text-slate-300 block mb-1">
                  AI Summary:
                </strong>
                {incident.ai_summary}
              </div>
            )}
          </Panel>

          {/* Audit trail */}
          <Panel
            title="Review History"
            action={
              reviews.length > 0 ? (
                <span className="text-[0.7rem] font-mono text-muted">
                  {reviews.length} {reviews.length === 1 ? "entry" : "entries"}
                </span>
              ) : null
            }
          >
            <ReviewTimeline reviews={reviews} />
          </Panel>
        </div>

        {/* Right column: Risk breakdown & Actions (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <Panel title="Risk Score Breakdown">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted font-medium">
                  Overall Score
                </span>
                <span className="text-xl font-bold font-mono text-white">
                  {incident.risk_score ?? "—"}{" "}
                  <span className="text-xs text-muted font-normal">/ 100</span>
                </span>
              </div>

              {/* Breakdown rows */}
              <ul className="space-y-3 pt-1">
                {contributions.map((row) => (
                  <li key={row.label} className="text-xs">
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>
                        {row.label}{" "}
                        <span className="text-[0.7rem] text-muted">
                          ({formatScore(row.value)} × {Math.round(row.weight * 100)}%)
                        </span>
                      </span>
                      <span className="font-mono text-muted">
                        {row.points.toFixed(1)} pts
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-raised overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (row.points / maxPoints) * 100)}%`,
                          backgroundColor: row.color,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="rounded-lg bg-canvas border border-line p-2.5 text-[0.7rem] text-muted space-y-1">
                <p>
                  <strong>Formula:</strong>{" "}
                  <code className="font-mono text-slate-300">
                    {RISK_FORMULA}
                  </code>
                </p>
                <p>Low: 0–39 · Medium: 40–69 · High: 70–100</p>
              </div>
            </div>
          </Panel>

          {/* Human verification */}
          <Panel
            title="Operator Verification"
            action={
              incident.operator_assessment ? (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-medium ${assessmentStyle(
                    incident.operator_assessment,
                  )}`}
                >
                  {incident.operator_assessment}
                </span>
              ) : null
            }
          >
            {incident.reviewed_by ? (
              <div className="mb-4 rounded-lg border border-line bg-canvas p-3 text-xs">
                <p className="text-slate-300">
                  Last reviewed by{" "}
                  <strong className="text-white">{incident.reviewed_by}</strong>{" "}
                  on{" "}
                  <span className="font-mono">
                    {formatDateTime(incident.reviewed_at)}
                  </span>
                  .
                </p>
                {incident.review_notes && (
                  <p className="mt-1.5 border-l-2 border-line pl-2.5 leading-relaxed text-muted">
                    {incident.review_notes}
                  </p>
                )}
              </div>
            ) : null}

            <ReviewPanel
              incidentId={incident.id}
              currentStatus={incident.status}
              lastReviewer={incident.reviewed_by}
            />
          </Panel>

          {/* Action controls */}
          <Panel title="Quick Status Change">
            <p className="mb-3 text-[0.7rem] text-muted leading-relaxed">
              Re-files the incident without recording a judgement. Use the
              verification form above when you have actually watched the footage.
            </p>
            <StatusControls
              incidentId={incident.id}
              currentStatus={incident.status}
            />
          </Panel>

          {/* Dispatch panel if verified */}
          {incident.status === "Verified" && (
            <DispatchPanel incident={incident} />
          )}
        </div>
      </div>
    </div>
  );
}
