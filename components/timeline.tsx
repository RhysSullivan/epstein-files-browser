"use client";

import { useMemo } from "react";
import { Celebrity, CelebrityAppearance } from "@/lib/celebrity-data";
import { extractDateFromFilename } from "@/lib/search-utils";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  date: Date;
  celebrities: Celebrity[];
  documentCount: number;
}

interface TimelineProps {
  celebrities: Celebrity[];
  onSelectDate?: (date: Date) => void;
  onSelectCelebrity?: (name: string) => void;
}

export function Timeline({ celebrities, onSelectDate, onSelectCelebrity }: TimelineProps) {
  const timelineEvents = useMemo(() => {
    const eventMap = new Map<string, TimelineEvent>();

    celebrities.forEach((celebrity) => {
      celebrity.appearances.forEach((appearance) => {
        const date = extractDateFromFilename(appearance.file);
        if (!date) return;

        const dateKey = date.toISOString().split("T")[0];

        if (!eventMap.has(dateKey)) {
          eventMap.set(dateKey, {
            date,
            celebrities: [],
            documentCount: 0,
          });
        }

        const event = eventMap.get(dateKey)!;
        if (!event.celebrities.find((c) => c.name === celebrity.name)) {
          event.celebrities.push(celebrity);
        }
        event.documentCount++;
      });
    });

    return Array.from(eventMap.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [celebrities]);

  const maxDocuments = useMemo(
    () => Math.max(...timelineEvents.map((e) => e.documentCount), 1),
    [timelineEvents]
  );

  if (timelineEvents.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No timeline data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Document Timeline</h3>
      
      {/* Compact timeline view */}
      <div className="relative space-y-3">
        {/* Vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />

        {timelineEvents.map((event, index) => (
          <div
            key={event.date.toISOString()}
            className="ml-8 space-y-2 pb-4"
          >
            {/* Date header */}
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-70 transition-opacity"
              onClick={() => onSelectDate?.(event.date)}
            >
              <div className="w-2 h-2 rounded-full bg-primary absolute -left-1" />
              <div className="text-sm font-medium">
                {event.date.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="text-xs text-muted-foreground">
                {event.documentCount} document{event.documentCount !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Progress bar showing document count */}
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${(event.documentCount / maxDocuments) * 100}%`,
                }}
              />
            </div>

            {/* Celebrity list */}
            {event.celebrities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {event.celebrities.slice(0, 3).map((celebrity) => (
                  <button
                    key={celebrity.name}
                    onClick={() => onSelectCelebrity?.(celebrity.name)}
                    className={cn(
                      "text-xs px-2 py-1 rounded-full bg-secondary hover:bg-secondary/80",
                      "transition-colors cursor-pointer"
                    )}
                  >
                    {celebrity.name}
                  </button>
                ))}
                {event.celebrities.length > 3 && (
                  <span className="text-xs px-2 py-1 text-muted-foreground">
                    +{event.celebrities.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2 pt-4 border-t">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">
            {timelineEvents.length}
          </div>
          <div className="text-xs text-muted-foreground">Time Periods</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">
            {timelineEvents.reduce((sum, e) => sum + e.documentCount, 0)}
          </div>
          <div className="text-xs text-muted-foreground">Total Documents</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">
            {Math.max(...timelineEvents.map((e) => e.celebrities.length))}
          </div>
          <div className="text-xs text-muted-foreground">Peak Appearances</div>
        </div>
      </div>
    </div>
  );
}
