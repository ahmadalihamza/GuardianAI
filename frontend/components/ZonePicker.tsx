"use client";

import { useRef, useState } from "react";
import type { Zone } from "@/lib/types";
import { CameraIcon, CrosshairIcon } from "@/components/Icons";

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
                className={`min-h-9 rounded-md px-2.5 py-2 text-xs font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5 ${
                  active
                    ? "bg-danger/10 text-danger border border-danger/40 shadow-sm"
                    : "border border-line bg-raised hover:bg-raised-2 text-ink hover:text-ink"
                }`}
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-danger" />}
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Surveillance Viewport Container */}
      {!videoUrl && (
        <p className="flex items-center gap-2 text-xs text-muted"><CameraIcon size={16} />No video selected</p>
      )}
      <div className="relative overflow-hidden rounded-lg border border-line bg-surface group">
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            playsInline
            muted
            className="block max-h-[440px] w-full object-contain mx-auto bg-black"
          />
        ) : (
          <div className="aspect-video w-full bg-raised/50" />
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
            className={`absolute zone-active-box rounded border border-danger/70 ${
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
            <span className="absolute -top-[1px] -left-[1px] h-2.5 w-2.5 border-t-2 border-l-2 border-danger pointer-events-none" />
            <span className="absolute -top-[1px] -right-[1px] h-2.5 w-2.5 border-t-2 border-r-2 border-danger pointer-events-none" />
            <span className="absolute -bottom-[1px] -left-[1px] h-2.5 w-2.5 border-b-2 border-l-2 border-danger pointer-events-none" />
            <span className="absolute -bottom-[1px] -right-[1px] h-2.5 w-2.5 border-b-2 border-r-2 border-danger pointer-events-none" />

            {/* Subtle Center Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30 text-danger">
              <CrosshairIcon size={18} />
            </div>

            {/* Professional Floating Badge */}
            <div className="absolute left-1 top-1 pointer-events-none flex max-w-[calc(100%-8px)] flex-wrap items-center gap-1 rounded bg-black/75 px-1.5 py-1 text-[9px] font-semibold text-on-dark">
              <span className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse shrink-0" />
              <span className="uppercase tracking-normal">Restricted Zone</span>
              <span className="font-mono font-normal text-on-dark/80">
                {widthPct}% × {heightPct}%
              </span>
            </div>
          </div>

          {/* Draw Mode Help Banner */}
          {drawMode && !disabled && (
            <div className="absolute inset-x-0 bottom-0 bg-black/85 border-t border-danger/30 px-4 py-2 text-center text-xs text-on-dark font-medium flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-danger animate-ping" />
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
          className={`min-h-10 rounded-md border px-3 py-2 font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5 ${
            drawMode
              ? "border-danger bg-danger/10 text-danger shadow"
              : "border-line bg-raised hover:bg-raised-2 text-ink hover:text-ink"
          }`}
        >
          <CrosshairIcon size={15} />
          <span>{drawMode ? "Cancel Drawing" : "Draw Custom Boundary"}</span>
        </button>

        <div className="flex items-center gap-2 font-mono text-[0.7rem] text-muted bg-surface border border-line px-2.5 py-1 rounded-md">
          <span>Boundary:</span>
          <span className="text-ink">
            [{left.toFixed(2)}, {top.toFixed(2)}] → [{(left + width).toFixed(2)}, {(top + height).toFixed(2)}]
          </span>
        </div>
      </div>
    </div>
  );
}
