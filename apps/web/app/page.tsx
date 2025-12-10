"use client"

import { Users, Mail, Clock, AlertTriangle, TrendingUp, Target, Filter } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { StatCard } from "@/components/dashboard/stat-card"
import { SentimentChart } from "@/components/dashboard/sentiment-chart"
import { TurnaroundChart } from "@/components/dashboard/turnaround-chart"
import { dashboardStats } from "@/lib/data"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Enterprise-wide email intelligence and customer insights</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Select defaultValue="all">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                <SelectItem value="premier">Premier Only</SelectItem>
                <SelectItem value="standard">Standard Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Total Customers"
            value={dashboardStats.totalCustomers}
            change={dashboardStats.customersChange}
            icon={Users}
            trend="up"
          />
          <StatCard title="Emails Analyzed" value="15.2K" change={dashboardStats.emailsChange} icon={Mail} trend="up" />
          <StatCard
            title="Avg Turnaround Time"
            value={dashboardStats.avgTurnaroundTime}
            change={dashboardStats.tatChange}
            icon={Clock}
            trend="up"
          />
          <StatCard
            title="Active Escalations"
            value={dashboardStats.activeEscalations}
            change={dashboardStats.escalationsNew}
            icon={AlertTriangle}
            trend="down"
          />
          <StatCard
            title="Upsell Opportunities"
            value={dashboardStats.upsellOpportunities}
            change={dashboardStats.upsellChange}
            icon={TrendingUp}
            trend="up"
          />
          <StatCard
            title="Premier Accounts"
            value={dashboardStats.premierAccounts}
            change={dashboardStats.premierCompliance}
            icon={Target}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <SentimentChart />
          <TurnaroundChart />
        </div>
      </div>
    </AppShell>
  )
}
