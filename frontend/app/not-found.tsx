import Link from "next/link";
import { ShieldIcon, ChevronRightIcon } from "@/components/Icons";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-10 text-center my-12">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-accent/10 text-accent border border-accent/30">
        <ShieldIcon size={28} />
      </div>
      <h1 className="text-xl font-bold text-ink tracking-normal">Record Not Found</h1>
      <p className="mt-2 text-xs text-muted leading-relaxed">
        The requested surveillance dossier, video stream, or page route could not be resolved. It may have been archived or removed from the system.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="button-primary rounded-md bg-accent hover:bg-accent-hover px-4 py-2 text-xs font-bold text-ink transition-colors shadow"
        >
          Return to SOC Overview
        </Link>
        <Link
          href="/incidents"
          className="rounded-lg border border-line bg-raised hover:bg-raised-2 px-4 py-2 text-xs font-semibold text-ink hover:text-ink transition-colors"
        >
          View Incident Queue
        </Link>
      </div>
    </div>
  );
}
