"use client";

import { useState } from "react";
import Link from "next/link";
import IncidentCard from "@/components/IncidentCard";
import { EmptyState, Panel } from "@/components/Panel";
import { ArrowRightIcon, CheckIcon, CheckCircleIcon, PlayIcon, VideoIcon } from "@/components/Icons";
import { PREPARED_SAMPLES } from "@/lib/samples";

export default function SampleLibrary() {
  const [selectedId, setSelectedId] = useState(PREPARED_SAMPLES[0]?.id);
  const [opened, setOpened] = useState(false);
  const sample = PREPARED_SAMPLES.find((item) => item.id === selectedId);
  if (!sample) return null;
  const result = sample.result;

  return (
    <section id="sample-library" className="space-y-7">
      <Panel
        title="Sample Library"
        action={<span className="inline-flex items-center gap-1.5 text-xs text-ok"><CheckCircleIcon size={14} />5 saved analyses</span>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {PREPARED_SAMPLES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === selectedId}
              onClick={() => { setSelectedId(item.id); setOpened(false); }}
              className="sample-tile overflow-hidden text-left transition-colors"
            >
              <div className="relative aspect-video overflow-hidden bg-raised">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.poster_url} alt="" className="h-full w-full object-cover" />
                <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-on-dark">00:10</span>
                {item.id === selectedId && (
                  <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-on-dark">
                    <CheckIcon size={15} strokeWidth={2.5} />
                  </span>
                )}
              </div>
              <div className="sample-tile-body min-h-[76px] space-y-1 px-3 py-3">
                <p className="text-[13px] font-semibold leading-snug text-ink">{item.title}</p>
                <p className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                  {item.result.incidents_created ?? 0} {(item.result.incidents_created ?? 0) === 1 ? "alert" : "alerts"} · Analysis saved
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="sample-inspector mt-7">
          <div className="media-surface relative">
            <video
              key={`${sample.id}-${opened}`}
              src={opened ? result.processed_video_url ?? sample.video_url : sample.video_url}
              poster={sample.poster_url}
              controls playsInline preload="metadata"
              className="aspect-video w-full object-contain"
              aria-label={`${sample.title} ${opened ? "analyzed video" : "sample preview"}`}
            />
            <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 text-[10px] font-medium text-on-dark">
              <VideoIcon size={12} />{opened ? "Analyzed footage" : "Original footage"}
            </span>
          </div>
          <div className="sample-details space-y-4">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent">
              {opened ? <CheckCircleIcon size={14} /> : <VideoIcon size={14} />}
              {opened ? "Analysis loaded" : "Saved analysis available"}
            </p>
            <div>
              <h3 className="text-[22px] font-bold leading-tight text-ink">{sample.title}</h3>
              <p className="mt-2 break-all font-mono text-[11px] text-muted">{sample.filename}</p>
            </div>
            <div className="grid grid-cols-3 border-y border-line py-4">
              {[
                ["Alerts", result.incidents_created ?? 0],
                ["People", result.people_tracked ?? 0],
                ["Vehicles", result.vehicles_tracked ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="sample-stat px-3 first:pl-0">
                  <p className="text-[24px] font-bold leading-none tabular-nums text-ink">{value}</p>
                  <p className="mt-2 text-[11px] text-muted">{label}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpened(true)}
              className="button-primary flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 text-[13px] font-semibold transition-colors hover:bg-accent-hover"
            >
              {opened ? <CheckCircleIcon size={16} /> : <PlayIcon size={16} />}
              {opened ? "Saved analysis loaded" : "Open saved analysis"}
              {!opened && <ArrowRightIcon size={16} className="ml-auto" />}
            </button>
            <p className="text-[11px] leading-relaxed text-muted" role={opened ? "status" : undefined}>
              {opened
                ? `Original processing time: ${result.processing_duration_seconds?.toFixed(1)}s. Results require human verification.`
                : "10-second clip · Results and evidence ready"}
            </p>
          </div>
        </div>
      </Panel>
      {opened && (
        <Panel
          title={`Detection Results (${result.incidents?.length ?? 0})`}
          action={<Link className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline" href="/incidents">Review queue<ArrowRightIcon size={14} /></Link>}
        >
          {result.incidents?.length ? (
            <div className="incident-list divide-y divide-line">
              {result.incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} />)}
            </div>
          ) : (
            <EmptyState title="No automatic alerts in this clip" hint="The pipeline completed without flagging an incident. A sample's title does not guarantee detection." />
          )}
        </Panel>
      )}
    </section>
  );
}
