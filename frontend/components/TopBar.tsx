"use client";

import { useEffect, useState } from "react";
import { ClockIcon, ShieldIcon } from "@/components/Icons";

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
    <header className="sticky top-0 z-10 hidden border-b border-line bg-surface/95 backdrop-blur-sm px-8 py-4 lg:flex items-center justify-between">
      <div className="flex items-center gap-3">
        <ShieldIcon size={16} className="text-accent" />
        <span className="text-xs font-medium text-ink">
          Human-in-the-loop monitoring
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted">
        {timeStr && (
          <div
            className="flex items-center gap-1.5 font-medium"
            suppressHydrationWarning
          >
            <ClockIcon size={14} className="text-muted" />
            <span suppressHydrationWarning>{timeStr}</span>
          </div>
        )}
      </div>
    </header>
  );
}
