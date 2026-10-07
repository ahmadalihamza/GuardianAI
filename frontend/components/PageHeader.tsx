import type { ReactNode } from "react";

export default function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col justify-between gap-4 pb-2 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <h1 className="break-words text-[28px] font-bold leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}
