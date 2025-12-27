import { FeaturesPanel } from "@/components/features-panel";

export default function FeaturesPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Analysis & Exploration Tools</h1>
          <p className="text-muted-foreground">
            Explore the documents using full-text search, timeline analysis, and network visualization.
          </p>
        </div>

        <FeaturesPanel />
      </div>
    </div>
  );
}
