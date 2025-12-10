"use client"

import { Mail, Building2, Users } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { type Employee } from "@/lib/types"

interface EmployeeCardProps {
  employee: Employee
  onClick: () => void
}

export function EmployeeCard({ employee, onClick }: EmployeeCardProps) {
  const initials = employee.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const statusStyles = {
    Active: "bg-green-500/10 text-green-600 dark:text-green-400",
    Inactive: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
    "On Leave": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  }

  return (
    <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary text-sm">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">{employee.name}</h3>
              <p className="text-sm text-muted-foreground">{employee.role || 'No role assigned'}</p>
            </div>
          </div>
          <Badge variant="secondary" className={cn("shrink-0", statusStyles[employee.status])}>
            {employee.status}
          </Badge>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{employee.email}</span>
          </div>

          {employee.reportsTo.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                Reports to {employee.reportsTo.length} manager{employee.reportsTo.length > 1 ? 's' : ''}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {employee.assignedCompanies.length} {employee.assignedCompanies.length === 1 ? "company" : "companies"}
            </span>
          </div>
        </div>

        {employee.department && (
          <div className="mt-3">
            <Badge variant="outline" className="text-xs">
              {employee.department}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
