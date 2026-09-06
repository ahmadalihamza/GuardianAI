import AnalyzeForm from "@/components/AnalyzeForm";
import Disclaimer from "@/components/Disclaimer";
import PageHeader from "@/components/PageHeader";

export const metadata = {
  title: "Analyze Video — GuardianAI",
};

export default function AnalyzePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analyze Video"
        subtitle="Upload surveillance footage to test restricted-zone intrusion and fall detection."
      />

      <AnalyzeForm />

      <Disclaimer />
    </div>
  );
}
