"use client"

import * as React from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { EmployeeForm, type EmployeeFormData } from "@/components/employees/employee-form"

// Re-export for backwards compatibility
export type { EmployeeFormData } from "@/components/employees/employee-form"

interface AddEmployeeDrawerProps {
  open: boolean
  onClose: () => void
  onSave: (data: EmployeeFormData) => void
  isLoading?: boolean
}

export function AddEmployeeDrawer({
  open,
  onClose,
  onSave,
  isLoading,
}: AddEmployeeDrawerProps) {
  const [key, setKey] = React.useState(0)

  const handleClose = () => {
    // Reset the form by changing the key
    setKey((k) => k + 1)
    onClose()
  }

  const handleSave = (data: EmployeeFormData) => {
    onSave(data)
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b border-border shrink-0">
          <SheetTitle>Add New Employee</SheetTitle>
        </SheetHeader>
        <EmployeeForm
          key={key}
          onSave={handleSave}
          onCancel={handleClose}
          isLoading={isLoading}
          mode="add"
        />
      </SheetContent>
    </Sheet>
  )
}
