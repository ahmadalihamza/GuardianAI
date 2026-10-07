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
      <div className="min-w-0">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink">
            <CameraIcon size={15} className="text-accent" />
            <span>Evidence Snapshot</span>
          </div>
          <span className="text-[10px] font-mono text-muted">
            Frame Capture
          </span>
        </div>

        <div className="pt-4 flex min-h-[230px] items-center justify-center">
          {evidenceUrl && !imgError ? (
            <div className="media-surface w-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={evidenceUrl}
                alt={`Evidence snapshot for ${incidentCode}`}
                onError={() => setImgError(true)}
                className="aspect-video w-full max-h-[340px] object-contain mx-auto"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-center text-muted py-10 px-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-raised text-muted">
                <CameraIcon size={18} />
              </div>
              <p className="text-xs font-medium text-ink">
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
      <div className="min-w-0">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink">
            <VideoIcon size={15} className="text-accent" />
            <span>Surveillance Video Footage</span>
          </div>
          <span className="text-[10px] font-mono text-muted">
            Annotated MP4
          </span>
        </div>

        <div className="pt-4 flex min-h-[230px] items-center justify-center">
          {videoUrl && !videoError ? (
            <div className="media-surface w-full">
              <video
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                onError={() => setVideoError(true)}
                className="aspect-video w-full max-h-[340px] object-contain mx-auto"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-center text-muted py-10 px-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-raised text-muted">
                <VideoIcon size={18} />
              </div>
              <p className="text-xs font-medium text-ink">
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
