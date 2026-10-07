"use client";

import Link from "next/link";
import { useState } from "react";
import { RiskBadge, SeverityBadge, StatusBadge } from "@/components/Badges";
import { formatVideoTime, mediaUrl } from "@/lib/format";
import type { Incident } from "@/lib/types";
import { ChevronRightIcon, CameraIcon } from "@/components/Icons";

export default function IncidentCard({ incident }: { incident: Incident }) {
  const [imgError, setImgError] = useState(false);
  const thumb = mediaUrl("evidence", incident.evidence_path);
  return (
    <Link href={`/incidents/${incident.id}`} className="incident-row group">
      <div className="incident-thumb relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-raised">
        {thumb && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" onError={() => setImgError(true)} className="h-full w-full object-cover" loading="lazy" />
        ) : <CameraIcon size={20} strokeWidth={1.5} className="text-dim" />}
      </div>
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="incident-title text-[14px] font-semibold leading-snug text-ink">{incident.event_type}</span>
          <SeverityBadge severity={incident.severity} />
        </div>
        <p className="mb-1 font-mono text-[10px] font-medium text-muted">{incident.incident_code}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          <span>{incident.camera_name ?? "Camera 01"}</span>
          <span aria-hidden className="h-0.5 w-0.5 rounded-full bg-dim" />
          <span>{incident.location ?? "Main Entrance"}</span>
          <span aria-hidden className="h-0.5 w-0.5 rounded-full bg-dim" />
          <span className="font-mono">{formatVideoTime(incident.video_timestamp)}</span>
          {typeof incident.person_track_id === "number" && incident.person_track_id >= 0 && (
            <>
              <span aria-hidden className="h-0.5 w-0.5 rounded-full bg-dim" />
              <span>Track #{incident.person_track_id}</span>
            </>
          )}
        </div>
      </div>
      <div className="incident-telemetry">
        <RiskBadge score={incident.risk_score} />
        <StatusBadge status={incident.status} />
        <ChevronRightIcon size={17} className="hidden text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-accent sm:block" />
      </div>
    </Link>
  );
}
