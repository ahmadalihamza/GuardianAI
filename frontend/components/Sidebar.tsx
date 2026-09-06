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
    <Link href="/" className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
        <ShieldIcon size={18} />
      </div>
      <div>
        <span className="font-semibold text-sm tracking-tight text-white block">
          GuardianAI
        </span>
        <span className="text-[0.7rem] text-slate-400 block leading-none">
          Surveillance Monitoring
        </span>
      </div>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="p-4 border-b border-line">
          <Wordmark />
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Main">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-600/10 text-blue-400 font-semibold"
                    : "text-slate-400 hover:bg-raised hover:text-slate-200"
                }`}
              >
                <Icon size={16} className={active ? "text-blue-400" : "text-slate-400"} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <BackendStatus />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Wordmark />
          <BackendStatus compact />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Main">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-blue-600/15 text-blue-400 font-semibold"
                    : "text-slate-400 hover:bg-raised hover:text-slate-200"
                }`}
              >
                <Icon size={14} className={active ? "text-blue-400" : "text-slate-400"} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
