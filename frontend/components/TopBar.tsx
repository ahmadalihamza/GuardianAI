"use client";

import { useEffect, useState } from "react";
import { ClockIcon, CheckCircleIcon } from "@/components/Icons";

export default function TopBar() {
  const [timeStr, setTimeStr] = useState<string>("");

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setTimeStr(
        now.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-10 hidden border-b border-line bg-surface/80 backdrop-blur-md px-6 py-3 lg:flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-xs font-medium text-slate-300">
          Surveillance Monitoring Active
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted">
        {timeStr && (
          <div
            className="flex items-center gap-1.5 font-medium"
            suppressHydrationWarning
          >
            <ClockIcon size={14} className="text-slate-400" />
            <span suppressHydrationWarning>{timeStr}</span>
          </div>
        )}
      </div>
    </header>
  );
}
