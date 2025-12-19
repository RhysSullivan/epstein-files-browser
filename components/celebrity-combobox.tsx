"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
}

export function CelebrityCombobox({
  celebrities,
  value,
  onValueChange,
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
          className="w-[250px] justify-between bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 hover:text-white"
        >
          {value === "All" ? (
            "All People"
          ) : selectedCelebrity ? (
            <span className="truncate">
              {selectedCelebrity.name} ({selectedCelebrity.count})
            </span>
          ) : (
            "Select person..."
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0 bg-zinc-800 border-zinc-700">
        <Command className="bg-zinc-800">
          <CommandInput
            placeholder="Search people..."
            className="text-white placeholder:text-zinc-500"
          />
          <CommandList>
            <CommandEmpty className="text-zinc-400">
              No person found.
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="All"
                onSelect={() => {
                  onValueChange("All");
                  setOpen(false);
                }}
                className="text-white hover:bg-zinc-700 data-[selected=true]:bg-zinc-700"
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === "All" ? "opacity-100" : "opacity-0"
                  )}
                />
                All People
              </CommandItem>
              {celebrities.map((celebrity) => (
                <CommandItem
                  key={celebrity.name}
                  value={celebrity.name}
                  onSelect={() => {
                    onValueChange(celebrity.name);
                    setOpen(false);
                  }}
                  className="text-white hover:bg-zinc-700 data-[selected=true]:bg-zinc-700"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === celebrity.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate flex-1">{celebrity.name}</span>
                  <span className="text-zinc-400 text-xs ml-2">
                    ({celebrity.count})
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
