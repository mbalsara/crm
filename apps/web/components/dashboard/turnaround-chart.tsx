"use client"

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { turnaroundData } from "@/lib/data"

const BAR_COLOR = "#3b82f6"

export function TurnaroundChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Average Turnaround Time (Hours)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={turnaroundData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#4b5563" />
              <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: "#9ca3af" }} />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#9ca3af" }}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  color: "#f9fafb",
                }}
                labelStyle={{ color: "#f9fafb" }}
                cursor={{ fill: "rgba(75, 85, 99, 0.3)" }}
              />
              <Bar dataKey="hours" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
