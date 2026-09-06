"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import IncidentCard from "@/components/IncidentCard";
import { EmptyState, Panel } from "@/components/Panel";
import ZonePicker from "@/components/ZonePicker";
import { mediaUrl } from "@/lib/format";
import { DEFAULT_ZONE } from "@/lib/types";
import type { AnalyzeResult, Zone } from "@/lib/types";
import {
  UploadCloudIcon,
  VideoIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  RefreshIcon,
} from "@/components/Icons";

const ACCEPTED_EXTENSIONS = [".mp4", ".avi", ".mov", ".mkv", ".webm"];

type Phase = "idle" | "uploading" | "processing" | "done" | "error";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One detector switch. Each extra detector costs CPU time, so the hint says
 * what the operator gets for it rather than just naming the feature.
 */
function FeatureToggle({
  label,
  hint,
  glyph,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  glyph: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
        checked
          ? "border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10"
          : "border-line bg-canvas hover:bg-raised/40"
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <span aria-hidden className="text-sm leading-5 shrink-0">
          {glyph}
        </span>
        <div className="min-w-0">
          <span className="text-xs font-medium text-white block">{label}</span>
          <span className="text-[0.7rem] text-muted block">{hint}</span>
        </div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded accent-blue-600"
      />
    </label>
  );
}

export default function AnalyzeForm() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const [cameraName, setCameraName] = useState("Camera 01");
  const [location, setLocation] = useState("Main Entrance");
  const [zoneSensitivity, setZoneSensitivity] = useState(0.5);
  const [zone, setZone] = useState<Zone>(DEFAULT_ZONE);
  const [enableIntrusion, setEnableIntrusion] = useState(true);
  const [enableFall, setEnableFall] = useState(true);
  const [enableFire, setEnableFire] = useState(false);
  const [enableWeapon, setEnableWeapon] = useState(false);
  const [enableAccident, setEnableAccident] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const busy = phase === "uploading" || phase === "processing";

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (phase !== "processing") return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => () => xhrRef.current?.abort(), []);

  const orderedZone = useMemo<Zone>(
    () => ({
      x1: Math.min(zone.x1, zone.x2),
      y1: Math.min(zone.y1, zone.y2),
      x2: Math.max(zone.x1, zone.x2),
      y2: Math.max(zone.y1, zone.y2),
    }),
    [zone],
  );

  const enabledCount = [
    enableIntrusion,
    enableFall,
    enableWeapon,
    enableFire,
    enableAccident,
  ].filter(Boolean).length;

  function acceptFile(candidate: File | null | undefined) {
    if (!candidate) return;
    const name = candidate.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      setError(
        `Unsupported video format. Allowed formats: ${ACCEPTED_EXTENSIONS.join(", ")}`,
      );
      return;
    }
    setError(null);
    setResult(null);
    setPhase("idle");
    setFile(candidate);
  }

  async function loadDemoVideo() {
    setLoadingDemo(true);
    setError(null);
    try {
      const res = await fetch("/api/demo");
      if (!res.ok) throw new Error("Could not load sample video.");
      const blob = await res.blob();
      const demoFile = new File([blob], "sample_surveillance.mp4", {
        type: "video/mp4",
      });
      acceptFile(demoFile);
      setCameraName("Camera 01");
      setLocation("Main Entrance");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sample video.");
    } finally {
      setLoadingDemo(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Please select a video file first.");
      return;
    }

    const body = new FormData();
    body.set("video", file);
    body.set("camera_name", cameraName.trim() || "Camera 01");
    body.set("location", location.trim() || "Main Entrance");
    body.set("zone_x1", String(orderedZone.x1));
    body.set("zone_y1", String(orderedZone.y1));
    body.set("zone_x2", String(orderedZone.x2));
    body.set("zone_y2", String(orderedZone.y2));
    body.set("zone_sensitivity", String(zoneSensitivity));
    body.set("enable_intrusion", String(enableIntrusion));
    body.set("enable_fall_detection", String(enableFall));
    body.set("enable_fire_detection", String(enableFire));
    body.set("enable_weapon_detection", String(enableWeapon));
    body.set("enable_accident_detection", String(enableAccident));

    setError(null);
    setResult(null);
    setProgress(0);
    setPhase("uploading");

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/analyze");
    xhr.timeout = 0;

    xhr.upload.onprogress = (progressEvent) => {
      if (progressEvent.lengthComputable) {
        setProgress(
          Math.round((progressEvent.loaded / progressEvent.total) * 100),
        );
      }
    };
    xhr.upload.onload = () => {
      setProgress(100);
      setPhase("processing");
    };

    xhr.onload = () => {
      xhrRef.current = null;
      let payload: AnalyzeResult | null = null;
      try {
        payload = JSON.parse(xhr.responseText) as AnalyzeResult;
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.success) {
        setResult(payload);
        setPhase("done");
        router.refresh();
      } else {
        setError(
          payload?.detail ??
            payload?.message ??
            `Analysis failed (HTTP ${xhr.status}).`,
        );
        setPhase("error");
      }
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setError("Network error while communicating with backend.");
      setPhase("error");
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setProgress(0);
      setPhase("idle");
    };

    xhr.send(body);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-12">
        {/* Left column: Video & Zone selection (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <Panel title="Video & Restricted Zone">
            {/* Upload dropzone */}
            <div className="space-y-4 mb-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (!busy) acceptFile(e.dataTransfer.files?.[0]);
                }}
                className={`rounded-xl border border-dashed p-5 text-center transition-colors ${
                  dragActive
                    ? "border-blue-500 bg-blue-500/10"
                    : file
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-line bg-canvas hover:border-slate-600"
                }`}
              >
                {file ? (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                        <CheckCircleIcon size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted">
                          {formatBytes(file.size)} · Ready to analyze
                        </p>
                      </div>
                    </div>
                    {!busy && (
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setResult(null);
                          setPhase("idle");
                        }}
                        className="rounded-md border border-line bg-raised hover:bg-raised-2 px-3 py-1 text-xs font-medium text-slate-300"
                      >
                        Change
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2.5 py-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-raised text-blue-400">
                      <UploadCloudIcon size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        Drag and drop a video file here
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Supports MP4, AVI, MOV, MKV, or WEBM
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <label
                        htmlFor="video-input"
                        className="cursor-pointer rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors"
                      >
                        Choose File
                      </label>
                      <span className="text-xs text-muted">or</span>
                      <button
                        type="button"
                        disabled={loadingDemo || busy}
                        onClick={loadDemoVideo}
                        className="rounded-lg border border-line bg-raised hover:bg-raised-2 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                      >
                        {loadingDemo ? "Loading sample..." : "Load Sample Video"}
                      </button>
                    </div>
                  </div>
                )}
                <input
                  id="video-input"
                  type="file"
                  accept={ACCEPTED_EXTENSIONS.join(",")}
                  disabled={busy}
                  className="sr-only"
                  onChange={(e) => acceptFile(e.target.files?.[0])}
                />
              </div>
            </div>

            {/* Video preview with interactive zone editor */}
            <ZonePicker
              videoUrl={previewUrl}
              zone={zone}
              onChange={setZone}
              disabled={busy}
            />
          </Panel>
        </div>

        {/* Right column: Configuration (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <Panel title="Analysis Settings">
            <div className="space-y-4">
              {/* Camera & Location */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Camera Name
                  </label>
                  <input
                    type="text"
                    value={cameraName}
                    disabled={busy}
                    onChange={(e) => setCameraName(e.target.value)}
                    placeholder="e.g. Camera 01"
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    disabled={busy}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Main Entrance"
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Sensitivity */}
              <div className="rounded-lg bg-canvas border border-line p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">Zone Sensitivity</span>
                  <span className="font-mono text-blue-400 font-semibold">
                    {Math.round(zoneSensitivity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={zoneSensitivity}
                  disabled={busy}
                  onChange={(e) => setZoneSensitivity(Number(e.target.value))}
                />
                <div className="flex justify-between text-[0.7rem] text-muted">
                  <span>Lenient (10%)</span>
                  <span>Default (50%)</span>
                  <span>Strict (100%)</span>
                </div>
              </div>

              {/* Detection checkboxes */}
              <div className="space-y-2 pt-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Detection Features
                  </span>
                  <span className="text-[0.7rem] text-muted font-mono">
                    {enabledCount} of 5 active
                  </span>
                </div>

                <FeatureToggle
                  label="Restricted Zone Intrusion"
                  hint="Alerts when people cross into the defined boundary"
                  glyph="🔒"
                  checked={enableIntrusion}
                  disabled={busy}
                  onChange={setEnableIntrusion}
                />

                <FeatureToggle
                  label="Fall Detection"
                  hint="Alerts on sudden horizontal posture transitions"
                  glyph="🚑"
                  checked={enableFall}
                  disabled={busy}
                  onChange={setEnableFall}
                />

                <FeatureToggle
                  label="Weapon Detection"
                  hint="Flags knives, bats and scissors, and links them to whoever is holding them"
                  glyph="🔪"
                  checked={enableWeapon}
                  disabled={busy}
                  onChange={setEnableWeapon}
                />

                <FeatureToggle
                  label="Fire & Smoke Detection"
                  hint="Colour, flicker and drift analysis on the frame itself"
                  glyph="🔥"
                  checked={enableFire}
                  disabled={busy}
                  onChange={setEnableFire}
                />

                <FeatureToggle
                  label="Traffic Accident Detection"
                  hint="Collisions, rollovers and hard braking from tracked vehicle motion"
                  glyph="🚗"
                  checked={enableAccident}
                  disabled={busy}
                  onChange={setEnableAccident}
                />

                {enabledCount === 0 && (
                  <p className="text-[0.7rem] text-amber-300/90 px-1">
                    All detectors are off — the video will be annotated but no
                    incidents will be raised.
                  </p>
                )}
                {(enableWeapon || enableFire) && (
                  <p className="text-[0.7rem] text-muted px-1 leading-relaxed">
                    Weapon and fire detection run without a purpose-trained
                    checkpoint by default, so treat their output as a prompt to
                    look, not a conclusion. Point{" "}
                    <code className="font-mono text-slate-300">
                      WEAPON_MODEL_PATH
                    </code>{" "}
                    /{" "}
                    <code className="font-mono text-slate-300">
                      FIRE_MODEL_PATH
                    </code>{" "}
                    at your own weights to replace the heuristics.
                  </p>
                )}
              </div>

              {/* Error box */}
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangleIcon size={16} className="shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit button & status */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={busy || !file}
                  className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm py-2.5 px-4 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  <VideoIcon size={16} />
                  <span>
                    {phase === "uploading"
                      ? `Uploading... (${progress}%)`
                      : phase === "processing"
                      ? `Analyzing video... (${elapsed}s elapsed)`
                      : "Start Video Analysis"}
                  </span>
                </button>
              </div>

              {/* Honest processing status */}
              {busy && (
                <div className="rounded-lg bg-canvas border border-line p-3 text-xs text-muted space-y-1 text-center">
                  <p className="text-slate-200 font-medium">
                    {phase === "uploading" ? "Uploading video to server..." : "Running YOLO detection & ByteTrack tracking..."}
                  </p>
                  <p className="text-[0.7rem]">
                    {phase === "processing"
                      ? `Processing frames and evaluating ${enabledCount} detector${enabledCount === 1 ? "" : "s"} on CPU. This typically takes 15–30 seconds.`
                      : "Transferring file..."}
                  </p>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </form>

      {/* Results view */}
      {result && result.success && (
        <section className="space-y-6 pt-4 border-t border-line">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <CheckCircleIcon size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Analysis Complete
                </h3>
                <p className="text-xs text-slate-300">
                  {result.people_tracked ?? 0} people tracked
                  {(result.vehicles_tracked ?? 0) > 0
                    ? ` · ${result.vehicles_tracked} vehicles tracked`
                    : ""}{" "}
                  · {result.incidents_created ?? 0} incidents detected in{" "}
                  {result.processing_duration_seconds?.toFixed(1) ?? "—"}s
                </p>
              </div>
            </div>

            {/* Which detectors actually ran, so the result is interpretable. */}
            {result.features && (
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["intrusion", "🔒 Intrusion"],
                    ["fall", "🚑 Fall"],
                    ["weapon", "🔪 Weapon"],
                    ["fire", "🔥 Fire"],
                    ["accident", "🚗 Traffic"],
                  ] as const
                )
                  .filter(([key]) => result.features?.[key])
                  .map(([key, label]) => (
                    <span
                      key={key}
                      title={
                        result.custom_models?.[key]
                          ? "Ran with a custom trained checkpoint"
                          : undefined
                      }
                      className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.7rem] font-medium text-emerald-300"
                    >
                      {label}
                      {result.custom_models?.[key] ? " ✦" : ""}
                    </span>
                  ))}
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Processed video */}
            <div className="lg:col-span-7">
              <Panel title="Processed Video with Detection Overlays">
                {result.processed_video_path ? (
                  <div className="overflow-hidden rounded-xl border border-line bg-black">
                    <video
                      src={mediaUrl("processed", result.processed_video_path) ?? ""}
                      controls
                      autoPlay
                      playsInline
                      className="w-full max-h-[440px] object-contain mx-auto"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg border border-line bg-canvas text-xs text-muted">
                    No output video available.
                  </div>
                )}
              </Panel>
            </div>

            {/* Generated incidents */}
            <div className="lg:col-span-5">
              <Panel title={`Detected Incidents (${result.incidents?.length ?? 0})`}>
                {result.incidents && result.incidents.length > 0 ? (
                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {result.incidents.map((inc) => (
                      <IncidentCard key={inc.id} incident={inc} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No incidents detected"
                    hint="None of the enabled detectors found anything reportable in this clip."
                  />
                )}
              </Panel>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
