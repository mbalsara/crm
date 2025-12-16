"use client"

import {
  Building2,
  Mail,
  Clock,
  User,
  Calendar,
  CheckCircle,
  MoreHorizontal,
  Reply,
  Forward,
  Trash2,
  Star,
  Archive,
  Tag,
  Paperclip,
  Download,
  Loader2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { InboxDetailPanelProps, InboxItemContent } from "./types"

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Get priority badge styling
 */
function getPriorityStyle(priority?: string) {
  switch (priority?.toLowerCase()) {
    case "critical":
      return "bg-destructive text-destructive-foreground"
    case "high":
      return "bg-amber-500 text-white"
    case "medium":
      return "bg-primary text-primary-foreground"
    case "low":
      return "bg-muted text-muted-foreground"
    default:
      return "bg-muted text-muted-foreground"
  }
}

/**
 * Get status badge styling
 */
function getStatusStyle(status?: string) {
  switch (status?.toLowerCase()) {
    case "open":
      return "border-destructive text-destructive"
    case "in_progress":
      return "border-primary text-primary"
    case "resolved":
      return "border-green-500 text-green-500"
    case "archived":
      return "border-muted-foreground text-muted-foreground"
    default:
      return "border-muted-foreground text-muted-foreground"
  }
}

/**
 * Format status for display
 */
function formatStatus(status?: string): string {
  if (!status) return ""
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/**
 * Get initials from name
 */
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/**
 * Sanitize email HTML to handle cid: URLs and other unsupported schemes
 */
function sanitizeEmailHtml(html: string): string {
  // Replace cid: image sources with a placeholder
  return html.replace(
    /<img([^>]*)\ssrc=["']cid:[^"']+["']([^>]*)>/gi,
    '<span class="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs text-muted-foreground">[Embedded image]</span>'
  )
}

/**
 * Email message component for thread display
 */
function MessageContent({ message }: { message: InboxItemContent }) {
  return (
    <div className="mb-6">
      {/* Message header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
          {getInitials(message.from.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{message.from.name}</p>
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {message.from.email}
          </p>
        </div>
      </div>

      {/* Recipients */}
      <div className="pl-[52px]">
        {message.to && message.to.length > 0 && (
          <div className="text-sm text-muted-foreground mb-2">
            <span>To: {message.to.map((r) => r.email).join(", ")}</span>
          </div>
        )}
        {message.cc && message.cc.length > 0 && (
          <div className="text-sm text-muted-foreground mb-2">
            <span>Cc: {message.cc.map((r) => r.email).join(", ")}</span>
          </div>
        )}

        {/* Body */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {message.bodyFormat === "html" ? (
            <div
              className="text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(message.body) }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-transparent p-0 m-0">
              {message.body}
            </pre>
          )}
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" />
              {message.attachments.length} attachment
              {message.attachments.length > 1 ? "s" : ""}
            </div>
            <div className="flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.url || "#"}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border border-border hover:bg-muted/50 transition-colors text-sm"
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate max-w-[200px]">{attachment.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({formatFileSize(attachment.size)})
                  </span>
                  <Download className="h-3 w-3 text-muted-foreground" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * InboxDetailPanel - Reusable detail panel for both emails and tasks
 *
 * Shows:
 * - Toolbar with actions (archive, delete, star, etc.)
 * - Item header with subject, priority, status badges
 * - Meta info grid (company, assignee, response time, etc.)
 * - Message content/body
 * - Thread messages (for email threads)
 * - Reply/Forward actions
 */
export function InboxDetailPanel({
  item,
  content,
  isLoading,
  callbacks,
  config,
  customActions,
}: InboxDetailPanelProps) {
  // Empty state
  if (!item) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Mail className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>Select an item to view details</p>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin opacity-50" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  const isTask = config.itemType === "task"
  const isEmail = config.itemType === "email"

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          {callbacks.onArchive && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => callbacks.onArchive?.([item.id])}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Archive</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {callbacks.onDelete && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => callbacks.onDelete?.([item.id])}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {(callbacks.onArchive || callbacks.onDelete) && (
            <Separator orientation="vertical" className="mx-1 h-6" />
          )}
          {callbacks.onStar && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => callbacks.onStar?.(item.id, !item.isStarred)}
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        item.isStarred && "fill-amber-500 text-amber-500"
                      )}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{item.isStarred ? "Unstar" : "Star"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Tag className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Label</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-1">
          {/* Task-specific: Done button */}
          {isTask && callbacks.onResolve && (
            <Button
              className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-sm"
              onClick={() => callbacks.onResolve?.(item.id)}
            >
              <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
              Done
            </Button>
          )}
          {/* Custom actions slot */}
          {customActions}
          {/* More actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isEmail && callbacks.onReply && (
                <DropdownMenuItem onClick={() => callbacks.onReply?.(item)}>
                  <Reply className="mr-2 h-4 w-4" />
                  Reply
                </DropdownMenuItem>
              )}
              {isEmail && callbacks.onForward && (
                <DropdownMenuItem onClick={() => callbacks.onForward?.(item)}>
                  <Forward className="mr-2 h-4 w-4" />
                  Forward
                </DropdownMenuItem>
              )}
              {isTask && <DropdownMenuItem>Add Note</DropdownMenuItem>}
              {isTask && callbacks.onAssign && (
                <DropdownMenuItem>Reassign</DropdownMenuItem>
              )}
              {(isEmail || isTask) && <DropdownMenuSeparator />}
              {callbacks.onMarkRead && (
                <DropdownMenuItem
                  onClick={() => callbacks.onMarkRead?.([item.id], !item.isRead)}
                >
                  Mark as {item.isRead ? "unread" : "read"}
                </DropdownMenuItem>
              )}
              {isTask && <DropdownMenuItem>Escalate Further</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="flex-1 h-0 min-h-0">
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">{item.subject}</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {item.isStarred && (
                    <Badge className="bg-amber-500/10 text-amber-600 border-0 text-xs">
                      <Star className="mr-1 h-3 w-3 fill-current" />
                      Starred
                    </Badge>
                  )}
                  {item.priority && (
                    <Badge className={cn("text-xs", getPriorityStyle(item.priority))}>
                      {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                    </Badge>
                  )}
                  {item.status && (
                    <Badge
                      variant="outline"
                      className={cn("text-xs", getStatusStyle(item.status))}
                    >
                      {formatStatus(item.status)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Meta info grid - primarily for tasks */}
            {isTask && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/50 text-sm">
                {item.companyName && (
                  <div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Building2 className="h-3 w-3" />
                      Company
                    </div>
                    <p className="font-medium">{item.companyName}</p>
                  </div>
                )}
                {item.recipients && item.recipients.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <User className="h-3 w-3" />
                      Assigned To
                    </div>
                    <p className="font-medium">{item.recipients[0].name}</p>
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Clock className="h-3 w-3" />
                    Created
                  </div>
                  <p className="font-medium">{formatTimestamp(item.timestamp)}</p>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Calendar className="h-3 w-3" />
                    Last Update
                  </div>
                  <p className="font-medium">{formatTimestamp(item.timestamp)}</p>
                </div>
              </div>
            )}
          </div>

          <Separator className="my-6" />

          {/* Content */}
          {content ? (
            <>
              <MessageContent message={content} />

              {/* Thread messages */}
              {content.threadMessages && content.threadMessages.length > 0 && (
                <>
                  <Separator className="my-6" />
                  <div className="space-y-6">
                    {content.threadMessages.map((message, index) => (
                      <div key={message.id || index}>
                        {index > 0 && <Separator className="my-6" />}
                        <MessageContent message={message} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            // Fallback to preview if content not loaded
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                {getInitials(item.sender.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{item.sender.name}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {item.sender.email}
                </p>
              </div>
            </div>
          )}

          {/* Reply/Forward section for emails */}
          {isEmail && (callbacks.onReply || callbacks.onForward) && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="flex gap-2">
                {callbacks.onReply && (
                  <Button
                    variant="outline"
                    className="flex-1 bg-transparent"
                    onClick={() => callbacks.onReply?.(item)}
                  >
                    <Reply className="mr-2 h-4 w-4" />
                    Reply
                  </Button>
                )}
                {callbacks.onForward && (
                  <Button
                    variant="outline"
                    className="flex-1 bg-transparent"
                    onClick={() => callbacks.onForward?.(item)}
                  >
                    <Forward className="mr-2 h-4 w-4" />
                    Forward
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
