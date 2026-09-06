"use client";

import Link from "next/link";
import { useState } from "react";
import { RiskBadge, SeverityBadge, StatusBadge } from "@/components/Badges";
import { eventTheme, formatVideoTime, mediaUrl } from "@/lib/format";
import type { Incident } from "@/lib/types";
import { ChevronRightIcon, CameraIcon } from "@/components/Icons";

export default function IncidentCard({ incident }: { incident: Incident }) {
  const [imgError, setImgError] = useState(false);
  const thumb = mediaUrl("evidence", incident.evidence_path);
  const theme = eventTheme(incident.event_type);

  return (
    <Link
      href={`/incidents/${incident.id}`}
      className="group flex items-center justify-between gap-3.5 py-3 px-4 hover:bg-raised/40 transition-colors"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Compact Thumbnail with Graceful Fallback */}
        <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-md bg-canvas border border-line flex items-center justify-center">
          {thumb && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500">
              <CameraIcon size={15} />
            </div>
          )}
        </div>

        {/* Incident Details */}
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-blue-400">
              {incident.incident_code}
            </span>
            <span
              aria-hidden
              title={theme.group}
              className="text-xs leading-none"
            >
              {theme.glyph}
            </span>
            <span className="text-xs font-semibold text-white truncate max-w-[220px] sm:max-w-md">
              {incident.event_type}
            </span>
            <SeverityBadge severity={incident.severity} />
          </div>

          <div className="flex flex-wrap items-center gap-x-2 text-[0.7rem] text-muted">
            <span>{incident.camera_name ?? "Camera 01"}</span>
            <span className="opacity-40">•</span>
            <span>{incident.location ?? "Main Entrance"}</span>
            <span className="opacity-40">•</span>
            <span className="font-mono">{formatVideoTime(incident.video_timestamp)}</span>
            {/* Region and vehicle events store -1: there is no person to name. */}
            {typeof incident.person_track_id === "number" &&
              incident.person_track_id >= 0 && (
                <>
                  <span className="opacity-40">•</span>
                  <span>Track #{incident.person_track_id}</span>
                </>
              )}
          </div>
        </div>
      </div>

      {/* Right Telemetry: Score & Status */}
      <div className="flex items-center gap-2.5 shrink-0">
        <RiskBadge score={incident.risk_score} />
        <StatusBadge status={incident.status} />
        <ChevronRightIcon
          size={14}
          className="text-slate-500 group-hover:text-slate-300 transition-colors hidden sm:block"
        />
      </div>
    </Link>
  );
}
