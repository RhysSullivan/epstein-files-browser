"use client";

import { useState, useMemo } from "react";
import { CELEBRITY_DATA } from "@/lib/celebrity-data";
import { SearchBar } from "@/components/search-bar";
import { Timeline } from "@/components/timeline";
import { NetworkGraph } from "@/components/network-graph";
import { SearchResult } from "@/lib/search-utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";

type ViewMode = "search" | "timeline" | "network";

export function FeaturesPanel() {
  const [viewMode, setViewMode] = useState<ViewMode>("search");
  const [selectedCelebrity, setSelectedCelebrity] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Filter celebrities based on selection
  const filteredCelebrities = useMemo(() => {
    if (!selectedCelebrity) return CELEBRITY_DATA;
    return CELEBRITY_DATA.filter((c) => c.name === selectedCelebrity);
  }, [selectedCelebrity]);

  const displayCelebrities = useMemo(() => {
    if (selectedCelebrity) {
      const celeb = CELEBRITY_DATA.find((c) => c.name === selectedCelebrity);
      return celeb ? [celeb] : CELEBRITY_DATA.slice(0, 50);
    }
    return CELEBRITY_DATA.slice(0, 100);
  }, [selectedCelebrity]);

  const handleSearchResult = (result: SearchResult) => {
    if (result.type === "celebrity") {
      setSelectedCelebrity(result.value);
      setSearchQuery(result.name);
    }
  };

  const handleSelectCelebrity = (name: string) => {
    setSelectedCelebrity(name);
    setSearchQuery(name);
  };

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {selectedCelebrity && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedCelebrity(null);
              setSearchQuery("");
            }}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        )}
        <h2 className="text-lg font-semibold">
          {selectedCelebrity || "Analysis Tools"}
        </h2>
      </div>

      {/* Search Bar */}
      <SearchBar
        onSelectResult={handleSearchResult}
        placeholder="Search by celebrity or document..."
      />

      {/* View Mode Tabs */}
      <div className="flex gap-2 border-b">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-none border-b-2 border-transparent",
            viewMode === "search" && "border-primary"
          )}
          onClick={() => setViewMode("search")}
        >
          Full-Text Search
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-none border-b-2 border-transparent",
            viewMode === "timeline" && "border-primary"
          )}
          onClick={() => setViewMode("timeline")}
        >
          Timeline
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-none border-b-2 border-transparent",
            viewMode === "network" && "border-primary"
          )}
          onClick={() => setViewMode("network")}
        >
          Network Graph
        </Button>
      </div>

      {/* Content Area */}
      <div className="min-h-[400px]">
        {viewMode === "search" && (
          <SearchView
            celebrities={displayCelebrities}
            onSelectCelebrity={handleSelectCelebrity}
          />
        )}
        {viewMode === "timeline" && (
          <Timeline
            celebrities={displayCelebrities}
            onSelectCelebrity={handleSelectCelebrity}
          />
        )}
        {viewMode === "network" && (
          <NetworkGraph
            celebrities={displayCelebrities}
            onSelectCelebrity={handleSelectCelebrity}
            maxNodes={selectedCelebrity ? 20 : 15}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Search results view showing all matching celebrities
 */
function SearchView({
  celebrities,
  onSelectCelebrity,
}: {
  celebrities: typeof CELEBRITY_DATA;
  onSelectCelebrity: (name: string) => void;
}) {
  const sorted = useMemo(
    () => [...celebrities].sort((a, b) => b.count - a.count),
    [celebrities]
  );

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Showing {sorted.length} of {CELEBRITY_DATA.length} celebrities
      </div>

      <div className="grid grid-cols-1 gap-2 max-h-[600px] overflow-y-auto">
        {sorted.map((celebrity) => (
          <button
            key={celebrity.name}
            onClick={() => onSelectCelebrity(celebrity.name)}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg",
              "bg-secondary/50 hover:bg-secondary transition-colors",
              "border border-border hover:border-primary/50"
            )}
          >
            <div className="text-left">
              <div className="font-semibold">{celebrity.name}</div>
              <div className="text-xs text-muted-foreground">
                {celebrity.count} document{celebrity.count !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-primary">
                {celebrity.appearances.length}
              </div>
              <div className="text-xs text-muted-foreground">appearances</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
