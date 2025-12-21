"use client";

import * as React from "react";
import { Check, ChevronsUpDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const sortOptions = [
  { value: "name", label: "Sort by Name" },
  { value: "size-desc", label: "Largest First" },
  { value: "size-asc", label: "Smallest First" },
];

interface SortComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function SortCombobox({
  value,
  onValueChange,
}: SortComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedSort = sortOptions.find((s) => s.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] sm:w-[260px] justify-between bg-secondary border-border text-foreground hover:bg-accent hover:text-foreground rounded-xl h-auto py-2.5 px-4 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium">
              {selectedSort?.label || "Select sort..."}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 bg-card border-border rounded-xl shadow-xl" align="start">
        <Command className="bg-transparent">
          <CommandList className="max-h-[300px]">
            <CommandGroup className="p-1.5">
              {sortOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  className="text-foreground hover:bg-accent data-[selected=true]:bg-accent rounded-lg px-3 py-2.5 cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2.5 h-4 w-4 text-primary",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="font-medium">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
