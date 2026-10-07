"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BackendStatus from "@/components/BackendStatus";
import {
  ShieldIcon,
  LayoutDashboardIcon,
  VideoIcon,
  ListFilterIcon,
  InfoIcon,
} from "@/components/Icons";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/analyze", label: "Analyze Video", icon: VideoIcon },
  { href: "/incidents", label: "Incidents", icon: ListFilterIcon },
  { href: "/system", label: "System Info", icon: InfoIcon },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-on-dark">
        <ShieldIcon size={23} strokeWidth={1.7} />
      </span>
      <span>
        <span className="block text-[21px] font-bold leading-tight text-ink">GuardianAI</span>
        <span className="mt-0.5 block text-[11px] font-medium text-muted">Surveillance Monitoring</span>
      </span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pb-7 pt-7"><Wordmark /></div>
        <div className="px-6 pb-3 text-[11px] font-semibold uppercase text-dim">Workspace</div>
        <nav className="flex-1 space-y-1.5 px-3" aria-label="Main">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                className="app-nav-link flex items-center gap-3 rounded-md px-4 py-3 text-[13px] font-semibold text-muted">
                <Icon size={19} strokeWidth={1.7} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <BackendStatus />
      </aside>
      <header className="sticky top-0 z-30 border-b border-line bg-surface lg:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <Wordmark />
          <BackendStatus compact />
        </div>
        <nav className="app-mobile-nav grid grid-cols-4 gap-1 px-2 pb-2" aria-label="Main">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                className="app-nav-link flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[10px] font-semibold text-muted">
                <Icon size={17} strokeWidth={1.7} />
                <span className="text-center">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
