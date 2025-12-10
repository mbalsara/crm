"use client"

import * as React from "react"
import { Mail, Calendar, Briefcase, Pencil, Building2, Users } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { type Employee } from "@/lib/types"

interface EmployeeDrawerProps {
  employee: Employee | null
  open: boolean
  onClose: () => void
  onStatusChange?: (id: string, status: Employee["status"]) => void
}

export function EmployeeDrawer({ employee, open, onClose, onStatusChange }: EmployeeDrawerProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [status, setStatus] = React.useState<Employee["status"]>("Active")

  React.useEffect(() => {
    if (employee) {
      setStatus(employee.status)
      setIsEditing(false)
    }
  }, [employee])

  if (!employee) return null

  const initials = employee.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const handleSave = () => {
    if (onStatusChange && status !== employee.status) {
      onStatusChange(employee.id, status)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setStatus(employee.status)
    setIsEditing(false)
  }

  const statusStyles: Record<string, string> = {
    Active: "bg-green-500/10 text-green-600 dark:text-green-400",
    Inactive: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
    "On Leave": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="bg-primary/10 text-primary text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <SheetTitle className="text-xl">{employee.name}</SheetTitle>
                <p className="text-sm text-muted-foreground">{employee.role || "No role assigned"}</p>
                {isEditing ? (
                  <Select value={status} onValueChange={(v) => setStatus(v as Employee["status"])}>
                    <SelectTrigger className="mt-1.5 h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                      <SelectItem value="On Leave">On Leave</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary" className={cn("mt-1", statusStyles[status])}>
                    {status}
                  </Badge>
                )}
              </div>
            </div>
            {!isEditing && (
              <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={() => setIsEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {/* Employee Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{employee.email}</span>
            </div>
            {employee.department && (
              <div className="flex items-center gap-3 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span>{employee.department}</span>
              </div>
            )}
            {employee.joinedDate && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Joined {new Date(employee.joinedDate).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Managers Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Reports To ({employee.reportsTo.length})
            </h4>
            <div className="border border-border rounded-lg p-4">
              {employee.reportsTo.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center">No managers assigned</p>
              ) : (
                <div className="space-y-2">
                  {employee.reportsTo.map((managerId) => (
                    <Badge key={managerId} variant="outline">
                      {managerId}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Companies Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Assigned Companies ({employee.assignedCompanies.length})
            </h4>
            <div className="border border-border rounded-lg p-4">
              {employee.assignedCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center">No companies assigned</p>
              ) : (
                <div className="space-y-2">
                  {employee.assignedCompanies.map((companyId) => (
                    <Badge key={companyId} variant="outline">
                      {companyId}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        {isEditing && (
          <div className="p-6 pt-4 border-t border-border shrink-0 flex justify-end gap-3">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
