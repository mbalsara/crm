"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandEmpty } from "@/components/ui/command"

export interface ComboboxItem {
  value: string
  label: string
  searchText?: string // Optional additional text to search against
}

interface VirtualizedComboboxProps {
  items: ComboboxItem[]
  value: string | null
  onChange: (value: string | null, item: ComboboxItem | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
}

export function VirtualizedCombobox({
  items,
  value,
  onChange,
  placeholder = "Select item...",
  searchPlaceholder = "Search...",
  emptyText = "No items found.",
  disabled = false,
  className,
}: VirtualizedComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const parentRef = React.useRef<HTMLDivElement>(null)

  // Filter items based on search
  const filteredItems = React.useMemo(() => {
    if (!search) return items
    const searchLower = search.toLowerCase()
    return items.filter(item => {
      const labelMatch = item.label.toLowerCase().includes(searchLower)
      const searchTextMatch = item.searchText?.toLowerCase().includes(searchLower)
      return labelMatch || searchTextMatch
    })
  }, [items, search])

  const virtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 5,
  })

  const selectedItem = items.find((item) => item.value === value)

  // Reset search when closing
  React.useEffect(() => {
    if (!open) {
      setSearch("")
    }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between bg-transparent", className)}
        >
          <span className="truncate">
            {selectedItem ? selectedItem.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          {filteredItems.length === 0 && (
            <CommandEmpty>{emptyText}</CommandEmpty>
          )}
          <div ref={parentRef} className="max-h-[300px] overflow-y-auto">
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const item = filteredItems[virtualItem.index]
                const isSelected = value === item.value

                return (
                  <div
                    key={item.value}
                    data-index={virtualItem.index}
                    className={cn(
                      "absolute left-0 top-0 w-full cursor-pointer select-none flex items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                      isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
                    )}
                    style={{
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    onClick={() => {
                      const newValue = value === item.value ? null : item.value
                      const newItem = newValue ? item : null
                      onChange(newValue, newItem)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{item.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
