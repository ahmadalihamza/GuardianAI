export default function Disclaimer() {
  return (
    <aside className="rounded-xl border border-line bg-surface/50 p-4 text-xs text-muted">
      <p className="font-semibold text-slate-300">Decision-Support System</p>
      <p className="mt-1 text-slate-400 leading-relaxed">
        GuardianAI provides automated alerts to assist human operators in reviewing surveillance video. All detections and risk scores are algorithmic estimates that require operator verification. No emergency services are automatically contacted.
      </p>
    </aside>
  );
}
