import { dispatchFor } from "@/lib/format";
import type { Incident } from "@/lib/types";

export default function DispatchPanel({ incident }: { incident: Incident }) {
  const { team } = dispatchFor(incident.event_type);

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">
          Recommended Action
        </h3>
        <span className="text-[0.7rem] font-medium text-accent bg-accent/10 border border-accent/30 px-2 py-0.5 rounded">
          Simulation
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 text-xs">
        <div className="rounded-lg bg-surface border border-line p-2.5">
          <span className="text-[0.7rem] text-muted block">Dispatch Unit</span>
          <span className="font-semibold text-ink mt-0.5 block">{team}</span>
        </div>
        <div className="rounded-lg bg-surface border border-line p-2.5">
          <span className="text-[0.7rem] text-muted block">Incident Code</span>
          <span className="font-mono text-ink mt-0.5 block">{incident.incident_code}</span>
        </div>
        <div className="rounded-lg bg-surface border border-line p-2.5">
          <span className="text-[0.7rem] text-muted block">Location</span>
          <span className="text-ink mt-0.5 block">{incident.location ?? "Main Area"}</span>
        </div>
      </div>

      <p className="text-[0.75rem] text-muted">
        Note: This is a prototype simulation. Real emergency or facility services are not contacted.
      </p>
    </div>
  );
}
