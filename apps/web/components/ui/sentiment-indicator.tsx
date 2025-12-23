"use client"

import * as React from "react"
import { Smile, Meh, Frown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export type SentimentValue = "positive" | "negative" | "neutral"

export interface SentimentData {
  value: SentimentValue
  confidence: number
}

interface SentimentIndicatorProps {
  sentiment: SentimentData | null | undefined
  size?: "sm" | "md" | "lg"
  showLabel?: boolean
  variant?: "icon" | "badge"
  className?: string
}

const iconSizeClasses = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
}

const iconColorClasses: Record<SentimentValue, string> = {
  positive: "text-green-500",
  negative: "text-red-500",
  neutral: "text-gray-500",
}

const badgeClasses: Record<SentimentValue, string> = {
  positive: "bg-green-500/10 text-green-600 border-green-500/20",
  negative: "bg-red-500/10 text-red-600 border-red-500/20",
  neutral: "bg-gray-500/10 text-gray-600 border-gray-500/20",
}

const labelText: Record<SentimentValue, string> = {
  positive: "Positive",
  negative: "Negative",
  neutral: "Neutral",
}

const SentimentIcon: Record<SentimentValue, React.ComponentType<{ className?: string }>> = {
  positive: Smile,
  negative: Frown,
  neutral: Meh,
}

/**
 * SentimentIndicator - Icon or badge indicating sentiment with confidence tooltip
 *
 * Usage:
 * <SentimentIndicator sentiment={{ value: "positive", confidence: 0.87 }} />
 * <SentimentIndicator sentiment={...} variant="badge" showLabel />
 */
export function SentimentIndicator({
  sentiment,
  size = "md",
  showLabel = false,
  variant = "badge",
  className,
}: SentimentIndicatorProps) {
  if (!sentiment) {
    return null
  }

  const confidencePercent = Math.round(sentiment.confidence * 100)
  const tooltipText = `${labelText[sentiment.value]} (${confidencePercent}% confidence)`

  const Icon = SentimentIcon[sentiment.value]

  if (variant === "icon") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-default">
            <Icon
              className={cn(
                "flex-shrink-0",
                iconSizeClasses[size],
                iconColorClasses[sentiment.value],
                className
              )}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "text-xs cursor-default",
            badgeClasses[sentiment.value],
            className
          )}
        >
          <Icon className={cn("flex-shrink-0 mr-1", iconSizeClasses[size])} />
          {showLabel && <span className="capitalize">{sentiment.value}</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  )
}
