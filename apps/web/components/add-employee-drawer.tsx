"use client"

import * as React from "react"
import { X, Plus, Building2, Users } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface AddEmployeeDrawerProps {
  open: boolean
  onClose: () => void
  onSave: (data: EmployeeFormData) => void
  isLoading?: boolean
}

export interface EmployeeFormData {
  firstName: string
  lastName: string
  email: string
  role?: string
  department?: string
  reportsTo?: string[] // Manager email addresses
  assignedCompanies?: string[] // Company domains
}

export function AddEmployeeDrawer({ open, onClose, onSave, isLoading }: AddEmployeeDrawerProps) {
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState("")
  const [department, setDepartment] = React.useState("")
  const [managerEmails, setManagerEmails] = React.useState<string[]>([])
  const [companyDomains, setCompanyDomains] = React.useState<string[]>([])
  const [newManagerEmail, setNewManagerEmail] = React.useState("")
  const [newCompanyDomain, setNewCompanyDomain] = React.useState("")
  const [step, setStep] = React.useState<"details" | "managers" | "companies">("details")

  const resetForm = () => {
    setFirstName("")
    setLastName("")
    setEmail("")
    setRole("")
    setDepartment("")
    setManagerEmails([])
    setCompanyDomains([])
    setNewManagerEmail("")
    setNewCompanyDomain("")
    setStep("details")
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSave = () => {
    onSave({
      firstName,
      lastName,
      email,
      role: role || undefined,
      department: department || undefined,
      reportsTo: managerEmails.length > 0 ? managerEmails : undefined,
      assignedCompanies: companyDomains.length > 0 ? companyDomains : undefined,
    })
  }

  const addManager = () => {
    if (newManagerEmail.trim() && !managerEmails.includes(newManagerEmail.trim())) {
      setManagerEmails((prev) => [...prev, newManagerEmail.trim()])
      setNewManagerEmail("")
    }
  }

  const removeManager = (email: string) => {
    setManagerEmails((prev) => prev.filter((e) => e !== email))
  }

  const addCompany = () => {
    if (newCompanyDomain.trim() && !companyDomains.includes(newCompanyDomain.trim())) {
      setCompanyDomains((prev) => [...prev, newCompanyDomain.trim()])
      setNewCompanyDomain("")
    }
  }

  const removeCompany = (domain: string) => {
    setCompanyDomains((prev) => prev.filter((d) => d !== domain))
  }

  const isDetailsValid = firstName.trim() && lastName.trim() && email.trim()

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b border-border">
          <SheetTitle>Add New Employee</SheetTitle>
        </SheetHeader>

        <div className="flex border-b border-border">
          {["details", "managers", "companies"].map((s) => (
            <button
              key={s}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors relative",
                step === s ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setStep(s as typeof step)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {step === s && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          {step === "details" && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.smith@company.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Account Manager" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Customer Success">Customer Success</SelectItem>
                    <SelectItem value="Support">Support</SelectItem>
                    <SelectItem value="Sales">Sales</SelectItem>
                    <SelectItem value="Engineering">Engineering</SelectItem>
                    <SelectItem value="Operations">Operations</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === "managers" && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Enter manager's email..."
                  value={newManagerEmail}
                  onChange={(e) => setNewManagerEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addManager()}
                />
                <Button variant="outline" size="sm" onClick={addManager}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {managerEmails.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No managers added</p>
                  <p className="text-xs">Enter a manager's email address above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {managerEmails.map((email) => (
                    <div
                      key={email}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{email}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeManager(email)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "companies" && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Enter company domain (e.g., acme.com)..."
                  value={newCompanyDomain}
                  onChange={(e) => setNewCompanyDomain(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCompany()}
                />
                <Button variant="outline" size="sm" onClick={addCompany}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {companyDomains.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Building2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No companies added</p>
                  <p className="text-xs">Enter a company domain above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {companyDomains.map((domain) => (
                    <div
                      key={domain}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{domain}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeCompany(domain)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="p-6 pt-4 border-t border-border flex gap-2">
          <Button variant="outline" className="flex-1 bg-transparent" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={!isDetailsValid || isLoading}>
            {isLoading ? "Adding..." : "Add Employee"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
