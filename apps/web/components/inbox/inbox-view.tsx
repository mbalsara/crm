"use client"

import * as React from "react"
import { Search, RefreshCw, Archive, Inbox, AlertTriangle, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { InboxListItem } from "./inbox-list-item"
import { InboxDetailPanel } from "./inbox-detail-panel"
import { cn } from "@/lib/utils"
import type {
  InboxViewProps,
  InboxItem,
  InboxItemContent,
  InboxFilter,
  InboxStatus,
} from "./types"

/**
 * InboxView - Main orchestrating component for inbox UI
 *
 * Provides a Gmail-like split view with:
 * - Left panel: Search, filters, item list
 * - Right panel: Selected item details
 *
 * Supports both controlled and uncontrolled selection modes.
 * Data fetching is delegated to the parent via callbacks.
 */
export function InboxView({
  config,
  callbacks,
  initialFilter,
  selectedItem: controlledSelectedItem,
  headerContent,
  toolbarActions,
  emptyState,
  loadingState,
  className,
}: InboxViewProps) {
  // Internal state
  const [items, setItems] = React.useState<InboxItem[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isLoadingMore, setIsLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(false)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)

  // Selection state (internal unless controlled)
  const [internalSelectedItem, setInternalSelectedItem] = React.useState<InboxItem | null>(null)
  const selectedItem = controlledSelectedItem !== undefined ? controlledSelectedItem : internalSelectedItem

  // Content loading
  const [content, setContent] = React.useState<InboxItemContent | null>(null)
  const [isLoadingContent, setIsLoadingContent] = React.useState(false)

  // Filter state
  const [filter, setFilter] = React.useState<InboxFilter>(initialFilter || {})
  const [statusFilter, setStatusFilter] = React.useState<InboxStatus | "all">("all")
  const [searchQuery, setSearchQuery] = React.useState(initialFilter?.query || "")

  // Debounced search
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  // Fetch items
  const fetchItems = React.useCallback(
    async (pageNum: number, append: boolean = false) => {
      try {
        if (append) {
          setIsLoadingMore(true)
        } else {
          setIsLoading(true)
        }

        const currentFilter: InboxFilter = {
          ...filter,
          query: searchQuery || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
        }

        const result = await callbacks.onFetchItems(currentFilter, {
          page: pageNum,
          limit: 20,
        })

        if (append) {
          setItems((prev) => [...prev, ...result.items])
        } else {
          setItems(result.items)
          // Auto-select first item if none selected
          if (!selectedItem && result.items.length > 0) {
            handleSelectItem(result.items[0])
          }
        }

        setTotal(result.total)
        setHasMore(result.hasMore)
        setPage(pageNum)
      } catch (error) {
        console.error("Failed to fetch items:", error)
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [callbacks, filter, searchQuery, statusFilter, selectedItem]
  )

  // Initial fetch
  React.useEffect(() => {
    fetchItems(1)
  }, [statusFilter]) // Re-fetch when status filter changes

  // Debounced search
  React.useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchItems(1)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

  // Fetch content when selection changes
  React.useEffect(() => {
    if (!selectedItem) {
      setContent(null)
      return
    }

    const fetchContent = async () => {
      setIsLoadingContent(true)
      try {
        const itemContent = await callbacks.onFetchContent(selectedItem.id)
        setContent(itemContent)
      } catch (error) {
        console.error("Failed to fetch content:", error)
        setContent(null)
      } finally {
        setIsLoadingContent(false)
      }
    }

    fetchContent()
  }, [selectedItem?.id, callbacks])

  // Handle item selection
  const handleSelectItem = (item: InboxItem) => {
    if (controlledSelectedItem === undefined) {
      setInternalSelectedItem(item)
    }
    callbacks.onSelect(item)

    // Mark as read if unread
    if (!item.isRead && callbacks.onMarkRead) {
      callbacks.onMarkRead([item.id], true)
      // Optimistically update local state
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isRead: true } : i))
      )
    }
  }

  // Handle refresh
  const handleRefresh = () => {
    fetchItems(1)
  }

  // Handle load more
  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      fetchItems(page + 1, true)
    }
  }

  // Keyboard navigation
  React.useEffect(() => {
    if (!config.keyboardNavigation) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "j" || e.key === "ArrowDown") {
        // Next item
        const currentIndex = items.findIndex((i) => i.id === selectedItem?.id)
        if (currentIndex < items.length - 1) {
          handleSelectItem(items[currentIndex + 1])
        }
      } else if (e.key === "k" || e.key === "ArrowUp") {
        // Previous item
        const currentIndex = items.findIndex((i) => i.id === selectedItem?.id)
        if (currentIndex > 0) {
          handleSelectItem(items[currentIndex - 1])
        }
      } else if (e.key === "e" && callbacks.onArchive && selectedItem) {
        // Archive
        callbacks.onArchive([selectedItem.id])
      } else if (e.key === "s" && callbacks.onStar && selectedItem) {
        // Star/unstar
        callbacks.onStar(selectedItem.id, !selectedItem.isStarred)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [config.keyboardNavigation, items, selectedItem, callbacks])

  // Count items by status for badges
  const openCount = items.filter((i) => i.status === "open").length
  const inProgressCount = items.filter((i) => i.status === "in_progress").length

  return (
    <div className={cn("flex h-full overflow-hidden", className)}>
      {/* Left Panel - Item List */}
      <div
        className="flex-shrink-0 border-r border-border flex flex-col bg-background"
        style={{ width: config.listPanelWidth || "400px" }}
      >
        {/* Header */}
        <div className="p-4 border-b border-border">
          {headerContent || (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Inbox className="h-5 w-5 text-primary" />
                  <h1 className="text-lg font-semibold">
                    {config.itemType === "task"
                      ? "Tasks"
                      : config.itemType === "email"
                      ? "Emails"
                      : "Inbox"}
                  </h1>
                </div>
                {config.showStatusFilter && (
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">
                      {openCount} Open
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {inProgressCount} In Progress
                    </Badge>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Search */}
          {config.showSearch && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={config.searchPlaceholder || "Search..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          )}

          {/* Status Filter Tabs */}
          {config.showStatusFilter && config.statusFilters && (
            <Tabs
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as InboxStatus | "all")}
            >
              <TabsList className="w-full">
                {config.statusFilters.map((sf) => (
                  <TabsTrigger key={sf.value} value={sf.value} className="flex-1 text-xs">
                    {sf.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {callbacks.onArchive && (
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
          )}
          {toolbarActions}
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {items.length} of {total} items
          </span>
        </div>

        {/* List */}
        <ScrollArea className="flex-1 h-0 min-h-0">
          {isLoading ? (
            loadingState || (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin opacity-50" />
                <p className="text-sm">{config.loadingMessage || "Loading..."}</p>
              </div>
            )
          ) : items.length > 0 ? (
            <>
              {items.map((item) => (
                <InboxListItem
                  key={item.id}
                  item={item}
                  isSelected={selectedItem?.id === item.id}
                  onClick={() => handleSelectItem(item)}
                  config={{
                    showPriority: config.showPriority,
                    showCompany: config.showCompany,
                    showThreadCount: config.showThreadCount,
                    itemType: config.itemType,
                  }}
                  showCheckbox={config.multiSelect}
                />
              ))}
              {hasMore && (
                <div className="p-4 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                </div>
              )}
            </>
          ) : (
            emptyState || (
              <div className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">{config.emptyMessage || "No items found"}</p>
              </div>
            )
          )}
        </ScrollArea>
      </div>

      {/* Right Panel - Detail View */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden" style={{ width: config.detailPanelWidth }}>
        <InboxDetailPanel
          item={selectedItem}
          content={content}
          isLoading={isLoadingContent}
          callbacks={{
            onArchive: callbacks.onArchive,
            onDelete: callbacks.onDelete,
            onMarkRead: callbacks.onMarkRead,
            onStar: callbacks.onStar,
            onReply: callbacks.onReply,
            onReplyAll: callbacks.onReplyAll,
            onForward: callbacks.onForward,
            onAssign: callbacks.onAssign,
            onUpdateStatus: callbacks.onUpdateStatus,
            onUpdatePriority: callbacks.onUpdatePriority,
            onResolve: callbacks.onResolve,
          }}
          config={{ itemType: config.itemType }}
        />
      </div>
    </div>
  )
}
