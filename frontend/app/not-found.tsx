import Link from "next/link";
import { ShieldIcon, ChevronRightIcon } from "@/components/Icons";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg glass-panel rounded-2xl border border-line p-8 text-center shadow-2xl my-12">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
        <ShieldIcon size={28} />
      </div>
      <h1 className="text-xl font-bold text-white tracking-tight">Record Not Found</h1>
      <p className="mt-2 text-xs text-slate-400 leading-relaxed">
        The requested surveillance dossier, video stream, or page route could not be resolved. It may have been archived or removed from the system.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-sky-500 hover:bg-sky-400 px-4 py-2 text-xs font-bold text-white transition-colors shadow"
        >
          Return to SOC Overview
        </Link>
        <Link
          href="/incidents"
          className="rounded-xl border border-line bg-raised hover:bg-raised-2 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
        >
          View Incident Queue
        </Link>
      </div>
    </div>
  );
}
