import { ShieldIcon } from "@/components/Icons";

export default function Disclaimer() {
  return (
    <aside className="flex items-start gap-3 border-t border-line pt-5 text-xs text-muted">
      <ShieldIcon size={18} strokeWidth={1.6} className="mt-0.5 shrink-0 text-accent" />
      <div>
        <p className="font-semibold text-ink">Human review comes first</p>
        <p className="mt-1 max-w-4xl text-[11px] leading-relaxed">
          Detections and risk scores need operator verification. No emergency services are automatically contacted.
        </p>
      </div>
    </aside>
  );
}
