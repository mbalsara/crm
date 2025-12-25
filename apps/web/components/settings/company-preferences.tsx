"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

export function CompanyPreferences() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Company Preferences</h2>
        <p className="text-sm text-muted-foreground">
          Configure organization-wide settings and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Configure how your team receives notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive email alerts for critical escalations</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Push Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive browser push notifications</p>
            </div>
            <Switch />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Weekly Digest</Label>
              <p className="text-sm text-muted-foreground">Receive a weekly summary of customer insights</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Escalation Rules</CardTitle>
          <CardDescription>Set automatic escalation thresholds</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="response-time">Response Time Threshold (hours)</Label>
            <Input id="response-time" type="number" defaultValue="4" className="max-w-xs" />
            <p className="text-sm text-muted-foreground">Auto-escalate if no response within this time</p>
          </div>
          <Separator />
          <div className="grid gap-2">
            <Label htmlFor="sentiment-threshold">Negative Sentiment Threshold</Label>
            <Input id="sentiment-threshold" type="number" defaultValue="3" className="max-w-xs" />
            <p className="text-sm text-muted-foreground">Consecutive negative emails before alert</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline">Cancel</Button>
        <Button>Save Changes</Button>
      </div>
    </div>
  )
}
