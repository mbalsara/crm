"use client"

import { Clock, Mail, AlertTriangle, Users, TrendingUp, TrendingDown, Minus, Tag } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Company } from "@/lib/types"
import { cn } from "@/lib/utils"

interface CustomerCardProps {
  company: Company
  onClick: () => void
}

export function CustomerCard({ company, onClick }: CustomerCardProps) {
  const sentimentIcon = {
    Positive: TrendingUp,
    Negative: TrendingDown,
    Neutral: Minus,
  }[company.sentiment]

  const SentimentIcon = sentimentIcon

  return (
    <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer hover:border-primary/50" onClick={onClick}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground mb-1">{company.name}</h3>
          <p className="text-sm text-muted-foreground">@{company.domains[0]}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              company.sentiment === "Positive" && "border-green-500 text-green-500",
              company.sentiment === "Negative" && "border-red-500 text-red-500",
              company.sentiment === "Neutral" && "border-amber-500 text-amber-500",
            )}
          >
            <SentimentIcon className="mr-1 h-3 w-3" />
            {company.sentiment}
          </Badge>
          <Badge
            className={cn(
              "text-xs",
              company.churnRisk === "Low" && "bg-green-500/10 text-green-500 border-0",
              company.churnRisk === "Medium" && "bg-amber-500/10 text-amber-500 border-0",
              company.churnRisk === "High" && "bg-red-500/10 text-red-500 border-0",
            )}
          >
            {company.churnRisk} Risk
          </Badge>
        </div>
      </div>

      {company.labels.length > 0 && (
        <div className="flex items-center gap-1 mb-4 flex-wrap">
          <Tag className="h-3 w-3 text-muted-foreground" />
          {company.labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-xs">
              {label}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-4">
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Mail className="h-3 w-3" />
            Total Emails
          </div>
          <p className="text-lg font-semibold">{company.totalEmails}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Clock className="h-3 w-3" />
            Avg TAT
          </div>
          <p className="text-lg font-semibold">{company.avgTAT}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <AlertTriangle className="h-3 w-3" />
            Escalations
          </div>
          <p className={cn("text-lg font-semibold", company.escalations > 0 && "text-destructive")}>
            {company.escalations}
          </p>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Engagement</div>
          <Badge variant="outline" className="text-xs">
            {company.engagement}
          </Badge>
        </div>
      </div>

      <div className="pt-4 border-t border-border">
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
          <Users className="h-3 w-3" />
          Key Contacts
        </div>
        <div className="flex flex-wrap gap-1">
          {company.contacts.slice(0, 2).map((contact) => (
            <Badge key={contact.id} variant="secondary" className="text-xs">
              {contact.name} ({contact.title})
            </Badge>
          ))}
          {company.contacts.length > 2 && (
            <Badge variant="secondary" className="text-xs">
              +{company.contacts.length - 2}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Last contact: {company.lastContact}</p>
      </div>
    </Card>
  )
}
