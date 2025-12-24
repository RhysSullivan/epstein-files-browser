'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface Celebrity {
  name: string
  count: number
}

interface CelebrityComboboxProps {
  celebrities: Celebrity[]
  value: string
  onValueChange: (value: string) => void
}

export function CelebrityCombobox({
  celebrities,
  value,
  onValueChange,
}: CelebrityComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedCelebrity = celebrities.find((c) => c.name === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="bg-secondary border-border text-foreground hover:bg-accent hover:text-foreground h-auto w-[220px] justify-between rounded-xl px-4 py-2.5 transition-all duration-200 sm:w-[260px]"
        >
          <div className="flex min-w-0 items-center gap-2">
            <User className="text-muted-foreground h-4 w-4 flex-shrink-0" />
            {value === 'All' ? (
              <span className="text-sm font-medium">All People</span>
            ) : selectedCelebrity ? (
              <span className="truncate text-sm font-medium">
                {selectedCelebrity.name}
                <span className="text-muted-foreground ml-1">
                  ({selectedCelebrity.count})
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground text-sm">
                Select person...
              </span>
            )}
          </div>
          <ChevronsUpDown className="text-muted-foreground ml-2 h-4 w-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="bg-card border-border w-[280px] rounded-xl p-0 shadow-xl"
        align="start"
      >
        <Command className="bg-transparent">
          <CommandInput
            placeholder="Search people..."
            className="text-foreground placeholder:text-muted-foreground border-border border-b"
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty className="text-muted-foreground py-6 text-center text-sm">
              No person found.
            </CommandEmpty>
            <CommandGroup className="p-1.5">
              <CommandItem
                value="All"
                onSelect={() => {
                  onValueChange('All')
                  setOpen(false)
                }}
                className="text-foreground hover:bg-accent data-[selected=true]:bg-accent cursor-pointer rounded-lg px-3 py-2.5"
              >
                <Check
                  className={cn(
                    'text-primary mr-2.5 h-4 w-4',
                    value === 'All' ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="font-medium">All People</span>
              </CommandItem>
              {celebrities.map((celebrity) => (
                <CommandItem
                  key={celebrity.name}
                  value={celebrity.name}
                  onSelect={() => {
                    onValueChange(celebrity.name)
                    setOpen(false)
                  }}
                  className="text-foreground hover:bg-accent data-[selected=true]:bg-accent cursor-pointer rounded-lg px-3 py-2.5"
                >
                  <Check
                    className={cn(
                      'text-primary mr-2.5 h-4 w-4',
                      value === celebrity.name ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="flex-1 truncate">{celebrity.name}</span>
                  <span className="text-muted-foreground bg-secondary ml-2 rounded-md px-2 py-0.5 text-xs">
                    {celebrity.count}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
