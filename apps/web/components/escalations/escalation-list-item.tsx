"use client"
import { Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Escalation } from "@/lib/data"
import { cn } from "@/lib/utils"

interface EscalationListItemProps {
  escalation: Escalation
  isSelected: boolean
  onClick: () => void
}

export function EscalationListItem({ escalation, isSelected, onClick }: EscalationListItemProps) {
  // Generate a preview body like Gmail
  const previewBody = `Customer reporting issue: ${escalation.description}`

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors",
        isSelected && "bg-muted",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Header row: Company + Priority + Time */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-sm truncate">{escalation.companyName}</span>
              {escalation.isPremier && <Star className="h-3 w-3 text-amber-500 fill-amber-500 flex-shrink-0" />}
            </div>
            <span className="text-xs text-muted-foreground flex-shrink-0">{escalation.created}</span>
          </div>

          {/* Subject line */}
          <p className={cn("text-sm truncate mb-1", !isSelected && "font-medium")}>{escalation.title}</p>

          {/* Preview text */}
          <p className="text-xs text-muted-foreground line-clamp-1">{previewBody}</p>

          {/* Badges row */}
          <div className="flex items-center gap-2 mt-2">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                escalation.priority === "Critical" && "border-destructive text-destructive",
                escalation.priority === "High" && "border-amber-500 text-amber-500",
                escalation.priority === "Medium" && "border-primary text-primary",
                escalation.priority === "Low" && "border-muted-foreground text-muted-foreground",
              )}
            >
              {escalation.priority}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                escalation.status === "Open" && "border-destructive text-destructive",
                escalation.status === "In Progress" && "border-primary text-primary",
              )}
            >
              {escalation.status}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{escalation.assignedTo}</span>
          </div>
        </div>
      </div>
    </button>
  )
}
