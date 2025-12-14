import * as React from "react"
import { X, Building2, Users, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useUsers, useCompanies } from "@/lib/hooks"
import { SearchOperator } from "@crm/shared"

export interface UserFormData {
  firstName: string
  lastName: string
  email: string
  role?: string
  department?: string
  reportsTo: string[] // Manager email addresses
  assignedCompanies: string[] // Company domains
}

interface UserFormProps {
  initialData?: Partial<UserFormData>
  onSave: (data: UserFormData) => void
  onCancel: () => void
  isLoading?: boolean
  mode: "add" | "edit"
}

export function UserForm({
  initialData,
  onSave,
  onCancel,
  isLoading,
  mode,
}: UserFormProps) {
  const [firstName, setFirstName] = React.useState(initialData?.firstName || "")
  const [lastName, setLastName] = React.useState(initialData?.lastName || "")
  const [email, setEmail] = React.useState(initialData?.email || "")
  const [role, setRole] = React.useState(initialData?.role || "")
  const [department, setDepartment] = React.useState(initialData?.department || "")
  const [managerEmails, setManagerEmails] = React.useState<string[]>(initialData?.reportsTo || [])
  const [companyDomains, setCompanyDomains] = React.useState<string[]>(initialData?.assignedCompanies || [])

  const [managerPopoverOpen, setManagerPopoverOpen] = React.useState(false)
  const [companyPopoverOpen, setCompanyPopoverOpen] = React.useState(false)
  const [managerSearch, setManagerSearch] = React.useState("")
  const [companySearch, setCompanySearch] = React.useState("")

  // Fetch users for manager selection
  const { data: usersData } = useUsers({
    queries: managerSearch
      ? [{ field: 'email', operator: SearchOperator.ILIKE, value: `%${managerSearch}%` }]
      : [],
    sortOrder: 'asc',
    limit: 50,
    offset: 0,
  })

  // Fetch companies for company selection
  const { data: companiesData } = useCompanies({
    queries: companySearch
      ? [{ field: 'name', operator: SearchOperator.ILIKE, value: `%${companySearch}%` }]
      : [],
    sortOrder: 'asc',
    limit: 50,
    offset: 0,
  })

  const managers = React.useMemo(() => {
    return usersData?.items?.map(user => ({
      value: user.email,
      label: `${user.firstName} ${user.lastName} (${user.email})`,
    })) || []
  }, [usersData])

  const companies = React.useMemo(() => {
    return companiesData?.items?.flatMap(company => 
      company.domains.map(domain => ({
        value: domain,
        label: `${company.name || domain} (${domain})`,
      }))
    ) || []
  }, [companiesData])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      firstName,
      lastName,
      email,
      role: role || undefined,
      department: department || undefined,
      reportsTo: managerEmails,
      assignedCompanies: companyDomains,
    })
  }

  const toggleManager = (email: string) => {
    setManagerEmails(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    )
  }

  const toggleCompany = (domain: string) => {
    setCompanyDomains(prev =>
      prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-6 py-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading || mode === "edit"}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Input
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={isLoading}
                placeholder="e.g., Account Manager"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={isLoading}
                placeholder="e.g., Sales"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reports To</Label>
            <Popover open={managerPopoverOpen} onOpenChange={setManagerPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  disabled={isLoading}
                >
                  <span className="truncate">
                    {managerEmails.length === 0
                      ? "Select managers..."
                      : `${managerEmails.length} manager${managerEmails.length > 1 ? 's' : ''} selected`}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search managers..."
                    value={managerSearch}
                    onValueChange={setManagerSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No managers found.</CommandEmpty>
                    <CommandGroup>
                      {managers.map((manager) => (
                        <CommandItem
                          key={manager.value}
                          value={manager.value}
                          onSelect={() => toggleManager(manager.value)}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <div
                              className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                                managerEmails.includes(manager.value)
                                  ? "bg-primary border-primary"
                                  : "border-input"
                              }`}
                            >
                              {managerEmails.includes(manager.value) && (
                                <X className="h-3 w-3 text-primary-foreground" />
                              )}
                            </div>
                            <span className="flex-1">{manager.label}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {managerEmails.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {managerEmails.map((email) => {
                  const manager = managers.find(m => m.value === email)
                  return (
                    <div
                      key={email}
                      className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm"
                    >
                      <span>{manager?.label.split(' (')[0] || email}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4"
                        onClick={() => toggleManager(email)}
                        disabled={isLoading}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Assigned Companies</Label>
            <Popover open={companyPopoverOpen} onOpenChange={setCompanyPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  disabled={isLoading}
                >
                  <span className="truncate">
                    {companyDomains.length === 0
                      ? "Select companies..."
                      : `${companyDomains.length} compan${companyDomains.length > 1 ? 'ies' : 'y'} selected`}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search companies..."
                    value={companySearch}
                    onValueChange={setCompanySearch}
                  />
                  <CommandList>
                    <CommandEmpty>No companies found.</CommandEmpty>
                    <CommandGroup>
                      {companies.map((company) => (
                        <CommandItem
                          key={company.value}
                          value={company.value}
                          onSelect={() => toggleCompany(company.value)}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <div
                              className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                                companyDomains.includes(company.value)
                                  ? "bg-primary border-primary"
                                  : "border-input"
                              }`}
                            >
                              {companyDomains.includes(company.value) && (
                                <X className="h-3 w-3 text-primary-foreground" />
                              )}
                            </div>
                            <span className="flex-1">{company.label}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {companyDomains.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {companyDomains.map((domain) => {
                  const company = companies.find(c => c.value === domain)
                  return (
                    <div
                      key={domain}
                      className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm"
                    >
                      <span>{company?.label.split(' (')[0] || domain}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4"
                        onClick={() => toggleCompany(domain)}
                        disabled={isLoading}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <div className="border-t border-border p-6 flex items-center justify-end gap-2 shrink-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : mode === "add" ? "Add User" : "Save Changes"}
        </Button>
      </div>
    </form>
  )
}
