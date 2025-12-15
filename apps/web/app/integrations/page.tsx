"use client"

import { useEffect } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { GmailIntegrationCard } from "@/components/integrations/gmail-card"
import { useGmailIntegration, useDisconnectIntegration, integrationKeys } from "@/lib/hooks"
import { useAuth } from "@/src/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"

export default function IntegrationsPage() {
  const { user } = useAuth()
  const tenantId = user?.tenantId || ''
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const {
    data: gmailIntegration,
    isLoading: isGmailLoading,
  } = useGmailIntegration(tenantId)

  const disconnectMutation = useDisconnectIntegration()

  // Handle OAuth callback
  useEffect(() => {
    const oauthStatus = searchParams.get('oauth')
    const error = searchParams.get('error')

    if (oauthStatus === 'success') {
      toast({
        title: "Gmail Connected",
        description: "Your Gmail account has been connected successfully.",
      })
      // Refresh integration data
      queryClient.invalidateQueries({ queryKey: integrationKeys.byTenantAndSource(tenantId, 'gmail') })
      // Clear URL params
      navigate('/integrations', { replace: true })
    } else if (oauthStatus === 'error' || error) {
      toast({
        title: "Connection Failed",
        description: error || "Failed to connect your Gmail account. Please try again.",
        variant: "destructive",
      })
      // Clear URL params
      navigate('/integrations', { replace: true })
    }
  }, [searchParams, toast, navigate, queryClient, tenantId])

  const handleConnect = () => {
    // This will be handled by the card component redirecting to OAuth
  }

  const handleDisconnect = () => {
    disconnectMutation.mutate(
      { tenantId, source: 'gmail' },
      {
        onSuccess: () => {
          toast({
            title: "Gmail Disconnected",
            description: "Your Gmail account has been disconnected.",
          })
        },
        onError: (error) => {
          toast({
            title: "Disconnect Failed",
            description: error.message || "Failed to disconnect Gmail. Please try again.",
            variant: "destructive",
          })
        },
      }
    )
  }

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">
            Connect your email and communication tools to sync customer data
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <GmailIntegrationCard
            integration={gmailIntegration ?? null}
            isLoading={isGmailLoading}
            isDisconnecting={disconnectMutation.isPending}
            tenantId={tenantId}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        </div>
      </div>
    </AppShell>
  )
}
