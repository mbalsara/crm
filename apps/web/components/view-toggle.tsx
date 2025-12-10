"use client"

import { LayoutGrid, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ViewToggleProps {
  view: "grid" | "table"
  onViewChange: (view: "grid" | "table") => void
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex items-center rounded-lg border border-border bg-muted p-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onViewChange("grid")}
        className={cn("h-8 px-3", view === "grid" && "bg-background shadow-sm")}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onViewChange("table")}
        className={cn("h-8 px-3", view === "table" && "bg-background shadow-sm")}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  )
}
