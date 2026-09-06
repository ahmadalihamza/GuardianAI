import type { ReactNode } from "react";
import { severityTheme } from "@/lib/format";
import { AlertTriangleIcon, AlertCircleIcon, ShieldIcon } from "@/components/Icons";

export default function AlertBox({
  severity,
  children,
}: {
  severity: string | null | undefined;
  children: ReactNode;
}) {
  const theme = severityTheme(severity);
  const isHigh = severity === "High";

  return (
    <div
      className={`rounded-xl border ${theme.border} bg-surface p-4 flex items-center gap-3.5`}
      role="status"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised"
        style={{ color: theme.hex }}
      >
        {isHigh ? (
          <AlertTriangleIcon size={16} />
        ) : severity === "Medium" ? (
          <AlertCircleIcon size={16} />
        ) : (
          <ShieldIcon size={16} />
        )}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
