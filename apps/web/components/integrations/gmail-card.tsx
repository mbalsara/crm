"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, ExternalLink, Unplug } from "lucide-react"
import { GMAIL_SCOPE_DESCRIPTIONS } from "@crm/shared"
import type { Integration } from "@/lib/api"
import { API_BASE_URL } from "@/lib/api"

// Gmail logo SVG
function GmailLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
    </svg>
  )
}

interface GmailIntegrationCardProps {
  integration: Integration | null
  isLoading: boolean
  isDisconnecting?: boolean
  tenantId: string
  onConnect: () => void
  onDisconnect: () => void
}

export function GmailIntegrationCard({
  integration,
  isLoading,
  isDisconnecting = false,
  tenantId,
  onConnect,
  onDisconnect
}: GmailIntegrationCardProps) {
  const isConnected = integration?.isActive === true

  const handleConnect = () => {
    if (!tenantId) {
      console.error('Cannot connect: tenantId is missing')
      return
    }
    // Redirect to OAuth flow
    window.location.href = `${API_BASE_URL}/oauth/gmail/authorize?tenantId=${tenantId}`
  }

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getWatchStatus = () => {
    if (!integration?.watchExpiresAt) return null
    const expiresAt = new Date(integration.watchExpiresAt)
    const now = new Date()
    const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiry < 0) {
      return { status: 'expired', text: 'Watch expired', variant: 'destructive' as const }
    } else if (daysUntilExpiry <= 1) {
      return { status: 'expiring', text: 'Expiring soon', variant: 'warning' as const }
    }
    return { status: 'active', text: `Active (${daysUntilExpiry} days)`, variant: 'default' as const }
  }

  const watchStatus = getWatchStatus()

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white border shadow-sm">
              <GmailLogo className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-lg">Gmail</CardTitle>
              <CardDescription>
                Sync and analyze emails from your Gmail account
              </CardDescription>
            </div>
          </div>
          {isConnected ? (
            <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary">Not Connected</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isConnected ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Last synced</p>
                <p className="font-medium">{formatDate(integration?.lastRunAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Watch status</p>
                {watchStatus && (
                  <Badge variant={watchStatus.variant === 'warning' ? 'secondary' : watchStatus.variant} className="mt-1">
                    {watchStatus.text}
                  </Badge>
                )}
              </div>
            </div>
            <div className="pt-2 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleConnect}
                disabled={isDisconnecting}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Reconnect
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={onDisconnect}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="mr-2 h-4 w-4" />
                )}
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Gmail account to automatically sync and analyze customer emails.
            </p>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Permissions requested:</strong>
              </p>
              <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                {GMAIL_SCOPE_DESCRIPTIONS.map((desc, i) => (
                  <li key={i}>{desc}</li>
                ))}
              </ul>
            </div>
            <Button
              className="w-full"
              onClick={handleConnect}
            >
              <GmailLogo className="mr-2 h-4 w-4" />
              Connect Gmail
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
