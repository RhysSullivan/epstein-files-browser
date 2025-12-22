"use client";

import * as React from "react";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Celebrity {
  name: string;
  count: number;
}

interface CelebrityComboboxProps {
  celebrities: Celebrity[];
  value: string;
  onValueChange: (value: string) => void;
  // Optional placeholder for the search input (defaults to "Search people...")
  placeholder?: string;
  // Optional label to use when value === "All" (defaults to "All People")
  allLabel?: string;
}

export function CelebrityCombobox({
  celebrities,
  value,
  onValueChange,
  placeholder,
  allLabel,
}: CelebrityComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedCelebrity = celebrities.find((c) => c.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] sm:w-[260px] justify-between bg-secondary border-border text-foreground hover:bg-accent hover:text-foreground rounded-xl h-auto py-2.5 px-4 transition-all duration-200"
        >
          <div className="flex items-center gap-2 min-w-0">
            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            {value === "All" ? (
              <span className="text-sm font-medium">{allLabel ?? "All People"}</span>
            ) : selectedCelebrity ? (
              <span className="truncate text-sm font-medium">
                {selectedCelebrity.name}
                <span className="text-muted-foreground ml-1">({selectedCelebrity.count})</span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Select person...</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 bg-card border-border rounded-xl shadow-xl" align="start">
        <Command className="bg-transparent">
            <CommandInput
            placeholder={placeholder ?? "Search people..."}
            className="text-foreground placeholder:text-muted-foreground border-b border-border"
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty className="text-muted-foreground py-6 text-center text-sm">
              {placeholder && placeholder.includes("document") ? "No document found." : "No person found."}
            </CommandEmpty>
            <CommandGroup className="p-1.5">
              <CommandItem
                value="All"
                onSelect={() => {
                  onValueChange("All");
                  setOpen(false);
                }}
                className="text-foreground hover:bg-accent data-[selected=true]:bg-accent rounded-lg px-3 py-2.5 cursor-pointer"
              >
                <Check
                  className={cn(
                    "mr-2.5 h-4 w-4 text-primary",
                    value === "All" ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="font-medium">All People</span>
              </CommandItem>
              {celebrities.map((celebrity) => (
                <CommandItem
                  key={celebrity.name}
                  value={celebrity.name}
                  onSelect={() => {
                    onValueChange(celebrity.name);
                    setOpen(false);
                  }}
                  className="text-foreground hover:bg-accent data-[selected=true]:bg-accent rounded-lg px-3 py-2.5 cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2.5 h-4 w-4 text-primary",
                      value === celebrity.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate flex-1">{celebrity.name}</span>
                  <span className="text-muted-foreground text-xs ml-2 bg-secondary px-2 py-0.5 rounded-md">
                    {celebrity.count}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
