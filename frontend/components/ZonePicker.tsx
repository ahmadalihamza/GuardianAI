"use client";

import { useRef, useState } from "react";
import type { Zone } from "@/lib/types";
import { CameraIcon } from "@/components/Icons";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const MIN_SIZE = 0.03;

export const ZONE_PRESETS: Array<{ name: string; zone: Zone }> = [
  { name: "Center Doorway", zone: { x1: 0.35, y1: 0.2, x2: 0.65, y2: 0.85 } },
  { name: "Right Corridor", zone: { x1: 0.6, y1: 0.25, x2: 0.95, y2: 0.85 } },
  { name: "Left Corridor", zone: { x1: 0.05, y1: 0.25, x2: 0.4, y2: 0.85 } },
  { name: "Full Area", zone: { x1: 0.05, y1: 0.1, x2: 0.95, y2: 0.9 } },
];

function isPresetActive(zone: Zone, preset: Zone): boolean {
  const eps = 0.02;
  return (
    Math.abs(zone.x1 - preset.x1) < eps &&
    Math.abs(zone.y1 - preset.y1) < eps &&
    Math.abs(zone.x2 - preset.x2) < eps &&
    Math.abs(zone.y2 - preset.y2) < eps
  );
}

export default function ZonePicker({
  videoUrl,
  zone,
  onChange,
  disabled = false,
}: {
  videoUrl: string | null;
  zone: Zone;
  onChange: (zone: Zone) => void;
  disabled?: boolean;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [dragging, setDragging] = useState(false);

  const left = Math.min(zone.x1, zone.x2);
  const top = Math.min(zone.y1, zone.y2);
  const width = Math.abs(zone.x2 - zone.x1);
  const height = Math.abs(zone.y2 - zone.y1);

  const widthPct = Math.round(width * 100);
  const heightPct = Math.round(height * 100);

  function toNormalised(clientX: number, clientY: number) {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!drawMode || disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toNormalised(event.clientX, event.clientY);
    startRef.current = point;
    setDragging(true);
    onChange({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!dragging || !start) return;
    const point = toNormalised(event.clientX, event.clientY);
    onChange({ x1: start.x, y1: start.y, x2: point.x, y2: point.y });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!dragging || !start) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const point = toNormalised(event.clientX, event.clientY);

    const x1 = Math.min(start.x, point.x);
    const y1 = Math.min(start.y, point.y);
    const x2 = Math.max(start.x, point.x);
    const y2 = Math.max(start.y, point.y);

    onChange({
      x1: Math.round(x1 * 100) / 100,
      y1: Math.round(y1 * 100) / 100,
      x2: Math.round(Math.max(x2, Math.min(1, x1 + MIN_SIZE)) * 100) / 100,
      y2: Math.round(Math.max(y2, Math.min(1, y1 + MIN_SIZE)) * 100) / 100,
    });

    startRef.current = null;
    setDragging(false);
    setDrawMode(false);
  }

  return (
    <div className="space-y-3.5">
      {/* Presets Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted font-medium">Zone Presets:</span>
        <div className="flex flex-wrap gap-1.5">
          {ZONE_PRESETS.map((preset) => {
            const active = isPresetActive(zone, preset.zone);
            return (
              <button
                key={preset.name}
                type="button"
                disabled={disabled}
                onClick={() => onChange(preset.zone)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5 ${
                  active
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm"
                    : "border border-line bg-raised hover:bg-raised-2 text-slate-300 hover:text-white"
                }`}
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Surveillance Viewport Container */}
      <div className="relative overflow-hidden rounded-xl border border-line bg-black/90 shadow-2xl group">
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            playsInline
            muted
            className="block max-h-[440px] w-full object-contain mx-auto bg-black"
          />
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 p-6 text-center text-muted bg-gradient-to-b from-surface/80 to-surface/40">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-raised border border-line text-slate-400">
              <CameraIcon size={22} />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">
                Awaiting Surveillance Footage
              </p>
              <p className="text-xs text-muted mt-1 max-w-sm">
                Upload a video above or test with preset boundaries. The restricted zone responds below in real-time.
              </p>
            </div>
          </div>
        )}

        {/* Interactive Calibration Overlay */}
        <div
          ref={overlayRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`absolute inset-0 select-none ${
            drawMode && !disabled
              ? "cursor-crosshair bg-black/30 backdrop-blur-[1px]"
              : "pointer-events-none"
          }`}
        >
          {/* Active Restricted Zone Box with Smooth Interpolated Transitions */}
          <div
            className={`absolute zone-active-box rounded border border-rose-500/70 shadow-lg ${
              dragging
                ? "transition-none"
                : "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            }`}
            style={{
              left: `${left * 100}%`,
              top: `${top * 100}%`,
              width: `${width * 100}%`,
              height: `${height * 100}%`,
            }}
          >
            {/* 4 Precision Corner Calibration Brackets */}
            <span className="absolute -top-[1px] -left-[1px] h-2.5 w-2.5 border-t-2 border-l-2 border-rose-400 pointer-events-none" />
            <span className="absolute -top-[1px] -right-[1px] h-2.5 w-2.5 border-t-2 border-r-2 border-rose-400 pointer-events-none" />
            <span className="absolute -bottom-[1px] -left-[1px] h-2.5 w-2.5 border-b-2 border-l-2 border-rose-400 pointer-events-none" />
            <span className="absolute -bottom-[1px] -right-[1px] h-2.5 w-2.5 border-b-2 border-r-2 border-rose-400 pointer-events-none" />

            {/* Subtle Center Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 text-rose-400">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="9" y1="3" x2="9" y2="15" />
                <line x1="3" y1="9" x2="15" y2="9" />
              </svg>
            </div>

            {/* Professional Floating Badge */}
            <div className="absolute left-2 top-2 pointer-events-none flex items-center gap-1.5 rounded-md bg-rose-950/85 backdrop-blur-md px-2 py-1 border border-rose-500/40 text-[0.65rem] font-bold text-rose-200 shadow-md">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
              <span className="uppercase tracking-wider">Restricted Zone</span>
              <span className="font-mono font-normal text-rose-300/80 pl-1 border-l border-rose-500/30">
                {widthPct}% × {heightPct}%
              </span>
            </div>
          </div>

          {/* Draw Mode Help Banner */}
          {drawMode && !disabled && (
            <div className="absolute inset-x-0 bottom-0 bg-slate-950/90 backdrop-blur-md border-t border-rose-500/30 px-4 py-2 text-center text-xs text-rose-300 font-medium flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
              <span>Click and drag across the viewport to calibrate custom boundary</span>
            </div>
          )}
        </div>
      </div>

      {/* Control Actions Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setDrawMode((mode) => !mode)}
          className={`rounded-lg border px-3 py-1.5 font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5 ${
            drawMode
              ? "border-rose-500 bg-rose-500/20 text-rose-300 shadow"
              : "border-line bg-raised hover:bg-raised-2 text-slate-200 hover:text-white"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              drawMode ? "bg-rose-400 animate-pulse" : "bg-slate-400"
            }`}
          />
          <span>{drawMode ? "Cancel Drawing" : "Draw Custom Boundary"}</span>
        </button>

        <div className="flex items-center gap-2 font-mono text-[0.7rem] text-muted bg-surface border border-line px-2.5 py-1 rounded-md">
          <span>Boundary:</span>
          <span className="text-slate-200">
            [{left.toFixed(2)}, {top.toFixed(2)}] → [{(left + width).toFixed(2)}, {(top + height).toFixed(2)}]
          </span>
        </div>
      </div>
    </div>
  );
}
