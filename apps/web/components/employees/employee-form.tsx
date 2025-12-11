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

export interface EmployeeFormData {
  firstName: string
  lastName: string
  email: string
  role?: string
  department?: string
  reportsTo: string[] // Manager email addresses
  assignedCompanies: string[] // Company domains
}

interface EmployeeFormProps {
  initialData?: Partial<EmployeeFormData>
  onSave: (data: EmployeeFormData) => void
  onCancel: () => void
  isLoading?: boolean
  mode: "add" | "edit"
}

export function EmployeeForm({
  initialData,
  onSave,
  onCancel,
  isLoading,
  mode,
}: EmployeeFormProps) {
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

  // Fetch users for manager autocomplete (search as user types)
  const { data: usersData, isLoading: usersLoading } = useUsers({
    queries: managerSearch
      ? [{ field: 'email', operator: SearchOperator.ILIKE, value: managerSearch }]
      : [],
    sortOrder: 'asc',
    limit: 20,
    offset: 0,
  })

  // Fetch companies for company autocomplete (search as user types)
  const { data: companiesData, isLoading: companiesLoading } = useCompanies({
    queries: companySearch
      ? [{ field: 'name', operator: SearchOperator.ILIKE, value: companySearch }]
      : [],
    sortOrder: 'asc',
    limit: 20,
    offset: 0,
  })

  // Update form when initialData changes
  React.useEffect(() => {
    if (initialData) {
      setFirstName(initialData.firstName || "")
      setLastName(initialData.lastName || "")
      setEmail(initialData.email || "")
      setRole(initialData.role || "")
      setDepartment(initialData.department || "")
      setManagerEmails(initialData.reportsTo || [])
      setCompanyDomains(initialData.assignedCompanies || [])
    }
  }, [initialData])

  const handleSave = () => {
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

  const addManager = (managerEmail: string) => {
    if (managerEmail.trim() && !managerEmails.includes(managerEmail.trim())) {
      setManagerEmails((prev) => [...prev, managerEmail.trim()])
    }
    setManagerPopoverOpen(false)
    setManagerSearch("")
  }

  const removeManager = (emailToRemove: string) => {
    setManagerEmails((prev) => prev.filter((e) => e !== emailToRemove))
  }

  const addCompany = (domain: string) => {
    if (domain.trim() && !companyDomains.includes(domain.trim())) {
      setCompanyDomains((prev) => [...prev, domain.trim()])
    }
    setCompanyPopoverOpen(false)
    setCompanySearch("")
  }

  const removeCompany = (domain: string) => {
    setCompanyDomains((prev) => prev.filter((d) => d !== domain))
  }

  // Filter out already selected users (and self in edit mode)
  const filteredUsers = React.useMemo(() => {
    if (!usersData?.items) return []
    return usersData.items.filter(
      (user) => !managerEmails.includes(user.email) && user.email !== email
    )
  }, [usersData?.items, managerEmails, email])

  // Get all unique domains from companies, filter out already selected
  const availableDomains = React.useMemo(() => {
    if (!companiesData?.items) return []
    const domains: { domain: string; companyName: string }[] = []
    companiesData.items.forEach((company) => {
      company.domains.forEach((domain) => {
        if (!companyDomains.includes(domain)) {
          domains.push({ domain, companyName: company.name || domain })
        }
      })
    })
    return domains
  }, [companiesData?.items, companyDomains])

  const isDetailsValid = firstName.trim() && lastName.trim() && email.trim()

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Basic Details */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  disabled={mode === "edit"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  disabled={mode === "edit"}
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
                disabled={mode === "edit"}
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

          {/* Managers Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <Label>Reports To</Label>
              {managerEmails.length > 0 && (
                <span className="text-xs text-muted-foreground">({managerEmails.length})</span>
              )}
            </div>

            <Popover open={managerPopoverOpen} onOpenChange={setManagerPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={managerPopoverOpen}
                  className="w-full justify-between"
                >
                  Search for manager...
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Type to search employees..."
                    value={managerSearch}
                    onValueChange={setManagerSearch}
                  />
                  <CommandList>
                    {usersLoading && <CommandEmpty>Loading...</CommandEmpty>}
                    {!usersLoading && !managerSearch && <CommandEmpty>Type to search...</CommandEmpty>}
                    {!usersLoading && managerSearch && filteredUsers.length === 0 && (
                      <CommandEmpty>No employees found.</CommandEmpty>
                    )}
                    {filteredUsers.length > 0 && (
                      <CommandGroup>
                        {filteredUsers.map((user) => (
                          <CommandItem
                            key={user.id}
                            value={user.email}
                            onSelect={() => addManager(user.email)}
                          >
                            <div className="flex flex-col">
                              <span>{user.firstName} {user.lastName}</span>
                              <span className="text-xs text-muted-foreground">{user.email}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {managerEmails.length === 0 ? (
              <p className="text-sm text-muted-foreground">No managers added</p>
            ) : (
              <div className="space-y-2">
                {managerEmails.map((managerEmail) => (
                  <div
                    key={managerEmail}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{managerEmail}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeManager(managerEmail)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Companies Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <Label>Assigned Companies</Label>
              {companyDomains.length > 0 && (
                <span className="text-xs text-muted-foreground">({companyDomains.length})</span>
              )}
            </div>

            <Popover open={companyPopoverOpen} onOpenChange={setCompanyPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={companyPopoverOpen}
                  className="w-full justify-between"
                >
                  Search for company...
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Type to search companies..."
                    value={companySearch}
                    onValueChange={setCompanySearch}
                  />
                  <CommandList>
                    {companiesLoading && <CommandEmpty>Loading...</CommandEmpty>}
                    {!companiesLoading && !companySearch && <CommandEmpty>Type to search...</CommandEmpty>}
                    {!companiesLoading && companySearch && availableDomains.length === 0 && (
                      <CommandEmpty>No companies found.</CommandEmpty>
                    )}
                    {availableDomains.length > 0 && (
                      <CommandGroup>
                        {availableDomains.map(({ domain, companyName }) => (
                          <CommandItem
                            key={domain}
                            value={domain}
                            onSelect={() => addCompany(domain)}
                          >
                            <div className="flex flex-col">
                              <span>{companyName}</span>
                              <span className="text-xs text-muted-foreground">{domain}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {companyDomains.length === 0 ? (
              <p className="text-sm text-muted-foreground">No companies assigned</p>
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
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-6 pt-4 border-t border-border flex gap-2 shrink-0">
        <Button variant="outline" className="flex-1 bg-transparent" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleSave} disabled={!isDetailsValid || isLoading}>
          {isLoading ? (mode === "add" ? "Adding..." : "Saving...") : mode === "add" ? "Add Employee" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
