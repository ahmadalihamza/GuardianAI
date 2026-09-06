"use client";

import { useState } from "react";
import { CameraIcon, VideoIcon } from "@/components/Icons";

interface IncidentMediaViewerProps {
  evidenceUrl: string | null;
  videoUrl: string | null;
  incidentCode: string;
}

export default function IncidentMediaViewer({
  evidenceUrl,
  videoUrl,
  incidentCode,
}: IncidentMediaViewerProps) {
  const [imgError, setImgError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Evidence Snapshot */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-surface/50">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <CameraIcon size={15} className="text-blue-400" />
            <span>Evidence Snapshot</span>
          </div>
          <span className="text-[0.65rem] font-mono text-muted bg-canvas border border-line px-2 py-0.5 rounded">
            Frame Capture
          </span>
        </div>

        <div className="p-4 bg-canvas/40 min-h-[260px] flex items-center justify-center">
          {evidenceUrl && !imgError ? (
            <div className="overflow-hidden rounded-lg border border-line bg-black w-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={evidenceUrl}
                alt={`Evidence snapshot for ${incidentCode}`}
                onError={() => setImgError(true)}
                className="w-full max-h-[340px] object-contain mx-auto"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-center text-muted py-10 px-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-raised text-slate-500">
                <CameraIcon size={18} />
              </div>
              <p className="text-xs font-medium text-slate-300">
                No Snapshot Available
              </p>
              <p className="text-[0.7rem] text-muted max-w-xs">
                An evidence frame was not saved or is missing from disk storage.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Video Footage */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-surface/50">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <VideoIcon size={15} className="text-blue-400" />
            <span>Surveillance Video Footage</span>
          </div>
          <span className="text-[0.65rem] font-mono text-muted bg-canvas border border-line px-2 py-0.5 rounded">
            Annotated MP4
          </span>
        </div>

        <div className="p-4 bg-canvas/40 min-h-[260px] flex items-center justify-center">
          {videoUrl && !videoError ? (
            <div className="overflow-hidden rounded-lg border border-line bg-black w-full">
              <video
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                onError={() => setVideoError(true)}
                className="w-full max-h-[340px] object-contain mx-auto bg-black"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-center text-muted py-10 px-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-raised text-slate-500">
                <VideoIcon size={18} />
              </div>
              <p className="text-xs font-medium text-slate-300">
                Video Footage Unavailable
              </p>
              <p className="text-[0.7rem] text-muted max-w-xs">
                The video file was not recorded or is not present in local
                storage.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
