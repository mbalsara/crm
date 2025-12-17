"use client"

import * as React from "react"
import { AlertTriangle, Search, RefreshCw, Archive, Inbox } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { EscalationListItem } from "@/components/escalations/escalation-list-item"
import { EscalationDetailPanel } from "@/components/escalations/escalation-detail-panel"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { escalations, type Escalation } from "@/lib/data"

export default function EscalationsPage() {
  const [statusFilter, setStatusFilter] = React.useState<"all" | "Open" | "In Progress">("all")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedEscalation, setSelectedEscalation] = React.useState<Escalation | null>(escalations[0] || null)

  const filteredEscalations = escalations.filter((escalation) => {
    const matchesStatus = statusFilter === "all" || escalation.status === statusFilter
    const matchesSearch =
      searchQuery === "" ||
      escalation.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      escalation.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      escalation.assignedTo.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  })

  const openCount = escalations.filter((e) => e.status === "Open").length
  const inProgressCount = escalations.filter((e) => e.status === "In Progress").length

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* Left Panel - Escalation List */}
        <div className="w-[400px] flex-shrink-0 border-r border-border flex flex-col bg-background">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Inbox className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-semibold">Escalations</h1>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">
                  {openCount} Open
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {inProgressCount} In Progress
                </Badge>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search escalations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {/* Filter Tabs */}
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1 text-xs">
                  All
                </TabsTrigger>
                <TabsTrigger value="Open" className="flex-1 text-xs">
                  Open
                </TabsTrigger>
                <TabsTrigger value="In Progress" className="flex-1 text-xs">
                  In Progress
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Archive all</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground">{filteredEscalations.length} items</span>
          </div>

          {/* List */}
          <ScrollArea className="flex-1 h-0 min-h-0">
            {filteredEscalations.length > 0 ? (
              filteredEscalations.map((escalation) => (
                <EscalationListItem
                  key={escalation.id}
                  escalation={escalation}
                  isSelected={selectedEscalation?.id === escalation.id}
                  onClick={() => setSelectedEscalation(escalation)}
                />
              ))
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No escalations found</p>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right Panel - Detail View */}
        <EscalationDetailPanel escalation={selectedEscalation} />
      </div>
    </AppShell>
  )
}
