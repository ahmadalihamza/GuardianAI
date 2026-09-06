import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import RefreshButton from "@/components/RefreshButton";
import { checkHealth, getStatistics } from "@/lib/api";
import { RISK_WEIGHTS, formatDuration, formatRate } from "@/lib/format";
import {
  ServerIcon,
  CpuIcon,
  DatabaseIcon,
  ShieldIcon,
  CheckCircleIcon,
  ClockIcon,
  SirenIcon,
  AlertTriangleIcon,
} from "@/components/Icons";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "System Info — GuardianAI",
};

const RISK_ROWS = [
  {
    component: "Confidence",
    weight: RISK_WEIGHTS.confidence,
    description: "Detection model confidence score (0.0 – 1.0)",
  },
  {
    component: "Seriousness",
    weight: RISK_WEIGHTS.seriousness,
    description: "Inherent severity of the detected event type",
  },
  {
    component: "Persistence",
    weight: RISK_WEIGHTS.persistence,
    description: "Duration of the event condition across frames",
  },
  {
    component: "Context",
    weight: RISK_WEIGHTS.context,
    description: "Calibrated restricted zone sensitivity factor",
  },
];

const WORKFLOW = [
  {
    title: "1. Video Processing",
    desc: "Surveillance video is decoded and processed frame-by-frame.",
  },
  {
    title: "2. Detection & Tracking",
    desc: "One YOLO11n pass per frame covers every enabled class at once; ByteTrack keeps track IDs stable across frames.",
  },
  {
    title: "3. Parallel Rule Engines",
    desc: "Zone, posture, weapon, vehicle-kinematics and fire modules all read the same detections, so nothing is inferred twice.",
  },
  {
    title: "4. Risk Scoring",
    desc: "A composite risk score (0–100) is calculated from confidence, duration, severity, and sensitivity.",
  },
  {
    title: "5. Human Verification",
    desc: "Operators judge each incident True, False or Unverifiable; every decision is appended to an immutable audit trail.",
  },
];

/**
 * What each detector actually is. The `basis` column is deliberately blunt: two
 * of these five have no trained class behind them, and an operator who does not
 * know that will over-trust them.
 */
const CAPABILITIES = [
  {
    name: "Restricted Zone Intrusion",
    events: "Restricted Zone Intrusion · Extended Intrusion",
    basis: "COCO person class + zone geometry",
    trained: true,
    note: "Requires a minimum track age and a sustained overlap, so a single stray box cannot raise an alert.",
  },
  {
    name: "Fall Detection",
    events: "Potential Fall",
    basis: "Box aspect-ratio and centroid transition",
    trained: true,
    note: "Needs a recent upright reference posture, which is what separates a fall from a slow sit-down.",
  },
  {
    name: "Weapon Detection",
    events: "Weapon Detected · Armed Person",
    basis: "COCO knife / baseball bat / scissors proxies",
    trained: false,
    note: "COCO has no firearm class. Proximity to a tracked person is what promotes a weapon to Armed Person.",
  },
  {
    name: "Fire & Smoke Detection",
    events: "Fire Detected · Smoke Detected",
    basis: "Chromatic gate, temporal flicker, persistence",
    trained: false,
    note: "Classical computer vision on pixels — no COCO class exists. Static orange objects are rejected by the flicker test.",
  },
  {
    name: "Traffic Accident Detection",
    events: "Vehicle Collision · Vehicle-Pedestrian Collision · Overturn · Sudden Stop",
    basis: "Scale-invariant kinematics on tracked vehicles",
    trained: true,
    note: "Speeds are measured in box-widths per second, so thresholds hold at any camera distance without retuning.",
  },
];

const MODELS = [
  {
    label: "Object Detection",
    value: "Ultralytics YOLO11n (nano)",
    detail:
      "One inference per frame across the COCO classes the enabled detectors need — people, vehicles and weapon proxies.",
  },
  {
    label: "Object Tracking",
    value: "ByteTrack",
    detail: "Preserves track consistency across occlusions and motion.",
  },
  {
    label: "Event Logic",
    value: "Five parallel rule engines",
    detail:
      "Zone geometry, posture transition, weapon attribution, vehicle kinematics and fire heuristics.",
  },
  {
    label: "Custom Checkpoints",
    value: "FIRE_MODEL_PATH · WEAPON_MODEL_PATH",
    detail:
      "Optional. Point either at your own weights to replace the corresponding heuristic with a trained model.",
  },
];

const PRIVACY = [
  "No facial recognition is used or stored.",
  "No biometric personal data is collected.",
  "Only numeric track IDs (e.g. Person #2) and bounding box coordinates are retained.",
  "Reviewer names are stored with each sign-off, because an audit trail without an author is not an audit trail.",
  "All processing and storage is local to your environment.",
];

export default async function SystemPage() {
  const [health, stats] = await Promise.all([checkHealth(), getStatistics()]);
  const isOnline = health.status === "healthy";
  const coverage =
    stats.total_incidents > 0
      ? Math.round((stats.reviewed_count / stats.total_incidents) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Status & Information"
        subtitle="Platform status, detection models, and risk scoring methodology."
        actions={<RefreshButton />}
      />

      {/* Health status metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          value={isOnline ? "Online" : "Offline"}
          label="Backend API"
          status={isOnline ? "ok" : "danger"}
          icon={<ServerIcon size={14} />}
          hint="FastAPI • Port 8000"
          badge={isOnline ? "200 OK" : "Error"}
        />
        <MetricCard
          value={health.model_loaded ? "Loaded" : "Missing"}
          label="YOLO11n Model"
          status={health.model_loaded ? "ok" : "danger"}
          icon={<CpuIcon size={14} />}
          hint="In-Memory Engine"
          badge="Nano CPU"
        />
        <MetricCard
          value={health.database_connected ? "Connected" : "Disconnected"}
          label="Database"
          status={health.database_connected ? "ok" : "danger"}
          icon={<DatabaseIcon size={14} />}
          hint="SQLite Store"
          badge="WAL Mode"
        />
        <MetricCard
          value={`v${health.version ?? "1.0.0"}`}
          label="Platform Version"
          status="info"
          icon={<ShieldIcon size={14} />}
          hint="GuardianAI Engine"
          badge="Production"
        />
      </div>

      {/* Models & Workflow */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Detection Models">
          <div className="space-y-3">
            {MODELS.map((item) => (
              <div key={item.label} className="rounded-lg bg-canvas border border-line p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted font-medium">{item.label}</span>
                  <span className="font-semibold text-slate-200">{item.value}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="How Detection Works">
          <ol className="space-y-2.5">
            {WORKFLOW.map((item) => (
              <li key={item.title} className="text-xs">
                <span className="font-semibold text-white block">{item.title}</span>
                <span className="text-muted leading-relaxed block mt-0.5">{item.desc}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {/* What each detector actually is */}
      <Panel title="Detection Capabilities">
        <div className="space-y-3">
          <p className="text-xs text-slate-300">
            Five detectors run in parallel over a single YOLO11n pass. Each is
            listed with the evidence it actually relies on, so a reviewer knows
            how much weight an alert deserves.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-2 px-3">Detector</th>
                  <th className="py-2 px-3">Events</th>
                  <th className="py-2 px-3">Basis</th>
                  <th className="py-2 px-3 whitespace-nowrap">Trained class</th>
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((item) => (
                  <tr key={item.name} className="border-b border-line/60 align-top">
                    <td className="py-2.5 px-3 font-medium text-white whitespace-nowrap">
                      {item.name}
                      <span className="mt-0.5 block font-normal text-[0.7rem] text-muted whitespace-normal max-w-[15rem]">
                        {item.note}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">{item.events}</td>
                    <td className="py-2.5 px-3 text-slate-300">{item.basis}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.65rem] font-medium whitespace-nowrap ${
                          item.trained
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        }`}
                      >
                        {item.trained ? "Yes" : "Heuristic"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[0.7rem] leading-relaxed text-amber-200/90">
            <strong>Read this before trusting a heuristic detector.</strong> Fire,
            smoke and weapon alerts are inferred from colour, flicker and COCO
            proxy classes — not from a model trained on fire or firearms. They
            are useful as a prompt for a human to look, and nothing more. Set{" "}
            <code className="font-mono text-amber-100">FIRE_MODEL_PATH</code> or{" "}
            <code className="font-mono text-amber-100">WEAPON_MODEL_PATH</code> to
            your own trained weights to replace the heuristic.
          </p>
        </div>
      </Panel>

      {/* Risk formula */}
      <Panel title="Risk Score Calculation">
        <div className="space-y-3">
          <p className="text-xs text-slate-300">
            Detected events receive a normalized risk score from <strong>0 to 100</strong> based on four weighted factors:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-2 px-3">Factor</th>
                  <th className="py-2 px-3">Weight</th>
                  <th className="py-2 px-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {RISK_ROWS.map((row) => (
                  <tr key={row.component} className="border-b border-line/60">
                    <td className="py-2 px-3 font-medium text-white">{row.component}</td>
                    <td className="py-2 px-3 font-mono text-blue-400 font-semibold">
                      {Math.round(row.weight * 100)}%
                    </td>
                    <td className="py-2 px-3 text-muted">{row.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[0.75rem] text-muted">
            <strong>Bands:</strong> Low (0–39) · Medium (40–69) · High (70–100).
          </p>
        </div>
      </Panel>

      {/* Reviewer analytics — the accuracy record of the deployment itself */}
      <Panel title="Verification Record">
        <div className="space-y-3">
          <p className="text-xs text-slate-300">
            Measured accuracy of this deployment, derived entirely from operator
            sign-offs rather than from model self-reporting.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              value={`${coverage}%`}
              label="Review Coverage"
              status={coverage >= 100 ? "ok" : "info"}
              icon={<CheckCircleIcon size={14} />}
              hint={`${stats.reviewed_count} of ${stats.total_incidents} judged`}
              badge={coverage >= 100 ? "Complete" : "In progress"}
            />
            <MetricCard
              value={formatRate(stats.false_positive_rate)}
              label="False Positive Rate"
              status="info"
              icon={<AlertTriangleIcon size={14} />}
              hint="Excludes Unverifiable"
              badge="Operator-judged"
            />
            <MetricCard
              value={formatDuration(stats.mean_seconds_to_review)}
              label="Mean Time to Review"
              status="info"
              icon={<ClockIcon size={14} />}
              hint="Creation to sign-off"
              badge="Rolling mean"
            />
            <MetricCard
              value={stats.critical_pending}
              label="Critical Unreviewed"
              status={stats.critical_pending > 0 ? "danger" : "ok"}
              icon={<SirenIcon size={14} />}
              hint="Weapons, fire, collisions"
              badge={stats.critical_pending > 0 ? "Review first" : "Clear"}
            />
          </div>

          <p className="text-[0.7rem] leading-relaxed text-muted">
            Every sign-off writes an append-only row recording the reviewer, the
            status transition, the True / False / Unverifiable assessment and any
            notes. Rows are never edited or deleted, so the audit trail stays
            usable as evidence. A dash means nothing has been judged yet — it is
            not a measured zero.
          </p>
        </div>
      </Panel>

      {/* Privacy */}
      <Panel title="Privacy & Security Safeguards">
        <ul className="space-y-2 text-xs text-slate-300">
          {PRIVACY.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="text-blue-400 font-bold">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
