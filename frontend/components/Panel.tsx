import type { ReactNode } from "react";
import { LayersIcon } from "@/components/Icons";

export function Panel({
  title, action, children, className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ui-section ${className}`}>
      {title || action ? (
        <header className="section-header flex items-center justify-between pb-3">
          <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="section-body">{children}</div>
    </section>
  );
}

export function EmptyState({ title, hint, action }: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface/70 px-5 py-8 text-center">
      <LayersIcon size={24} strokeWidth={1.5} className="mb-2 text-dim" />
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-md text-xs leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Field({ label, children, mono = false }: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 border-b border-line py-3">
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className={`mt-1.5 break-words text-[13px] text-ink ${mono ? "font-mono font-medium" : ""}`}>{children}</dd>
    </div>
  );
}
