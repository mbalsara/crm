"use client"

import * as React from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { type Employee } from "@/lib/types"
import { EmployeeForm, type EmployeeFormData } from "@/components/employees/employee-form"

interface EmployeeDrawerProps {
  employee: Employee | null
  open: boolean
  onClose: () => void
  onSave?: (id: string, data: EmployeeFormData) => void
  isLoading?: boolean
}

export function EmployeeDrawer({
  employee,
  open,
  onClose,
  onSave,
  isLoading,
}: EmployeeDrawerProps) {
  if (!employee) return null

  const initials = employee.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const handleSave = (data: EmployeeFormData) => {
    if (onSave) {
      onSave(employee.id, data)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <SheetTitle className="text-xl">Edit Employee</SheetTitle>
          </div>
        </SheetHeader>
        <EmployeeForm
          initialData={{
            firstName: employee.firstName,
            lastName: employee.lastName,
            email: employee.email,
            role: employee.role,
            department: employee.department,
            reportsTo: employee.reportsTo,
            assignedCompanies: employee.assignedCompanies,
          }}
          onSave={handleSave}
          onCancel={onClose}
          isLoading={isLoading}
          mode="edit"
        />
      </SheetContent>
    </Sheet>
  )
}
