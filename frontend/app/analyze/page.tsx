import AnalyzeForm from "@/components/AnalyzeForm";
import Disclaimer from "@/components/Disclaimer";
import PageHeader from "@/components/PageHeader";
import SampleLibrary from "@/components/SampleLibrary";

export const metadata = {
  title: "Analyze Video — GuardianAI",
};

export default function AnalyzePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analyze Video"
        subtitle="Open a prepared sample instantly, inspect its results, and verify alerts. You can also upload your own footage."
      />

      <SampleLibrary />
      <details className="rounded-xl border border-line bg-canvas p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">Upload & analyze a new video</summary>
        <div className="mt-5"><AnalyzeForm /></div>
      </details>

      <Disclaimer />
    </div>
  );
}
