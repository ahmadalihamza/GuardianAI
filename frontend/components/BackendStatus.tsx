"use client";

import { useEffect, useState, useCallback } from "react";
import type { HealthStatus } from "@/lib/types";
import { ServerIcon, RefreshIcon } from "@/components/Icons";

const POLL_INTERVAL_MS = 15_000;

export default function BackendStatus({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as HealthStatus;
        setHealth(data);
      } else {
        setHealth({
          status: "unreachable",
          model_loaded: false,
          database_connected: false,
        });
      }
    } catch {
      setHealth({
        status: "unreachable",
        model_loaded: false,
        database_connected: false,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [check]);

  const isOnline = health?.status === "healthy";

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`h-2 w-2 rounded-full ${
            loading
              ? "bg-warn animate-pulse"
              : isOnline
              ? "bg-ok"
              : "bg-danger"
          }`}
        />
        <span className="text-muted text-[0.75rem]">
          {loading ? "Checking..." : isOnline ? "Online" : "Offline"}
        </span>
      </div>
    );
  }

  return (
    <div className="border-t border-line p-4">
      <div className="text-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                loading
                  ? "bg-warn animate-pulse"
                  : isOnline
                  ? "bg-ok"
                  : "bg-danger"
              }`}
            />
            <span className="font-semibold text-ink">
              {loading ? "Checking status..." : isOnline ? "System Ready" : "Backend Offline"}
            </span>
          </div>
          {!isOnline && !loading && (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void check();
              }}
              className="text-[0.7rem] text-accent hover:underline flex items-center gap-1"
            >
              <RefreshIcon size={11} />
              <span>Retry</span>
            </button>
          )}
        </div>

        <div className="space-y-2 pt-3 border-t border-line/60 text-[0.7rem] text-muted">
          <div className="flex flex-wrap justify-between gap-1">
            <span>Detection Model</span>
            <span className={health?.model_loaded ? "text-ink font-medium" : "text-danger"}>
              {health?.model_loaded ? "YOLO11n (Loaded)" : "Not Loaded"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Database</span>
            <span className={health?.database_connected ? "text-ink font-medium" : "text-danger"}>
              {health?.database_connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
