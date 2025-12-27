"use client";

import { useState, useMemo } from "react";
import { searchCelebrities, SearchResult } from "@/lib/search-utils";
import { CELEBRITY_DATA } from "@/lib/celebrity-data";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandInput } from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  onSelectResult?: (result: SearchResult) => void;
  placeholder?: string;
}

export function SearchBar({ onSelectResult, placeholder = "Search celebrities or documents..." }: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const results = useMemo(
    () => searchCelebrities(value, CELEBRITY_DATA),
    [value]
  );

  const groupedResults = useMemo(() => {
    const celebrities = results.filter((r) => r.type === "celebrity").slice(0, 5);
    const documents = results.filter((r) => r.type === "document").slice(0, 5);
    return { celebrities, documents };
  }, [results]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full">
          <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            className={cn(
              "w-full px-3 py-2 rounded-md border border-input bg-background",
              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            )}
          />
        </div>
      </PopoverTrigger>
      {open && value && (
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="space-y-2 p-4">
            {groupedResults.celebrities.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                  Celebrities
                </h3>
                <div className="space-y-1">
                  {groupedResults.celebrities.map((result) => (
                    <Button
                      key={result.value}
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        onSelectResult?.(result);
                        setOpen(false);
                        setValue("");
                      }}
                    >
                      <span className="flex-1 text-left text-sm">
                        {result.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {result.matches}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {groupedResults.documents.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                  Documents
                </h3>
                <div className="space-y-1">
                  {groupedResults.documents.map((result) => (
                    <Button
                      key={result.value}
                      variant="ghost"
                      className="w-full justify-start text-left truncate"
                      onClick={() => {
                        onSelectResult?.(result);
                        setOpen(false);
                        setValue("");
                      }}
                    >
                      <span className="flex-1 truncate text-sm">
                        {result.name.split("/").pop()}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {results.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">
                  No results found
                </p>
              </div>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
