"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
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
  className?: string
}

const sizeClasses = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
}

const colorClasses: Record<SentimentValue, string> = {
  positive: "bg-green-500",
  negative: "bg-red-500",
  neutral: "bg-gray-400",
}

const labelText: Record<SentimentValue, string> = {
  positive: "Positive",
  negative: "Negative",
  neutral: "Neutral",
}

/**
 * SentimentIndicator - Colored dot indicating sentiment with confidence tooltip
 *
 * Usage:
 * <SentimentIndicator sentiment={{ value: "positive", confidence: 0.87 }} />
 */
export function SentimentIndicator({
  sentiment,
  size = "md",
  showLabel = false,
  className,
}: SentimentIndicatorProps) {
  if (!sentiment) {
    return null
  }

  const confidencePercent = Math.round(sentiment.confidence * 100)
  const tooltipText = `${labelText[sentiment.value]} (${confidencePercent}% confidence)`

  const dot = (
    <span
      className={cn(
        "inline-block rounded-full flex-shrink-0",
        sizeClasses[size],
        colorClasses[sentiment.value],
        className
      )}
      aria-label={tooltipText}
    />
  )

  const content = showLabel ? (
    <span className="inline-flex items-center gap-1.5">
      {dot}
      <span className="text-xs text-muted-foreground capitalize">
        {sentiment.value}
      </span>
    </span>
  ) : (
    dot
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default">{content}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  )
}
