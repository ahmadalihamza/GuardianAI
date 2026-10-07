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
        subtitle="A closer look at your footage, with evidence ready for human review."
      />

      <SampleLibrary />
      <details className="border-y border-line bg-surface px-5 py-5">
        <summary className="cursor-pointer text-sm font-semibold text-accent">Upload & analyze a new video</summary>
        <div className="mt-5"><AnalyzeForm /></div>
      </details>

      <Disclaimer />
    </div>
  );
}
