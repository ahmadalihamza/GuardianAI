"use client";

import { useState } from "react";
import Link from "next/link";
import IncidentCard from "@/components/IncidentCard";
import { EmptyState, Panel } from "@/components/Panel";
import { PREPARED_SAMPLES } from "@/lib/samples";

export default function SampleLibrary() {
  const [selectedId, setSelectedId] = useState(PREPARED_SAMPLES[0]?.id);
  const [opened, setOpened] = useState(false);
  const sample = PREPARED_SAMPLES.find((item) => item.id === selectedId);
  if (!sample) return null;
  const result = sample.result;

  return (
    <section id="sample-library" className="space-y-5">
      <Panel title="Sample Video Library · Ready to review">
        <p className="mb-4 text-sm text-slate-300">
          These five 10-second clips are already uploaded and analyzed. Select a sample,
          open its saved analysis instantly, then inspect the evidence and verify any alerts.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {PREPARED_SAMPLES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === selectedId}
              onClick={() => { setSelectedId(item.id); setOpened(false); }}
              className={`overflow-hidden rounded-lg border text-left transition-colors ${
                item.id === selectedId ? "border-blue-400 bg-blue-500/10" : "border-line bg-canvas hover:border-slate-500"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.poster_url} alt="" className="aspect-video w-full object-cover" />
              <div className="space-y-1 p-3">
                <p className="text-xs font-semibold text-white">{item.title}</p>
                <p className="text-[0.7rem] text-emerald-300">10s · Analysis saved</p>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-line bg-black">
            <video
              key={`${sample.id}-${opened}`}
              src={opened ? result.processed_video_url ?? sample.video_url : sample.video_url}
              poster={sample.poster_url}
              controls playsInline preload="metadata"
              className="aspect-video w-full object-contain"
              aria-label={`${sample.title} ${opened ? "analyzed video" : "sample preview"}`}
            />
          </div>
          <div className="flex flex-col justify-center gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-300">{opened ? "Step 2 · Inspect & verify" : "Step 1 · Open analysis"}</p>
            <h3 className="text-lg font-semibold text-white">{sample.title}</h3>
            <p className="text-xs text-muted break-all">{sample.filename}</p>
            <p className="text-sm text-slate-300">
              {opened
                ? `${result.incidents_created ?? 0} saved alerts · ${result.people_tracked ?? 0} people tracked · ${result.vehicles_tracked ?? 0} vehicles tracked`
                : "The video, detection results and evidence frames are ready. No upload or processing queue is needed."}
            </p>
            <button
              type="button"
              onClick={() => setOpened(true)}
              className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
            >
              {opened ? "Saved Analysis Loaded" : "Run Analysis · Instant Saved Result"}
            </button>
            {opened && (
              <p className="text-xs text-emerald-300" role="status">
                Loaded from saved analysis. Original processing took {result.processing_duration_seconds?.toFixed(1)}s.
                Select an alert below to inspect and record your decision.
              </p>
            )}
          </div>
        </div>
      </Panel>
      {opened && (
        <Panel title={`Saved Detection Results (${result.incidents?.length ?? 0})`}>
          {result.incidents?.length ? (
            <div className="divide-y divide-line">
              {result.incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} />)}
            </div>
          ) : (
            <EmptyState title="No automatic alerts in this clip" hint="The pipeline completed but did not flag an incident. Inspect the saved video above; a sample's title does not guarantee detection." />
          )}
          <p className="mt-3 text-xs text-muted">
            Saved detector output requires human judgment. <Link className="text-blue-300 hover:underline" href="/incidents">Open the verification queue →</Link>
          </p>
        </Panel>
      )}
    </section>
  );
}
