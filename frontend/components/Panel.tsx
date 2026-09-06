import type { ReactNode } from "react";

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface overflow-hidden ${className}`}>
      {title || action ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 bg-surface/50">
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line/80 py-10 px-4 text-center">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {hint && <p className="max-w-md text-xs text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-canvas border border-line/60 p-3">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-200 ${mono ? "font-mono font-medium" : ""}`}>
        {children}
      </dd>
    </div>
  );
}
