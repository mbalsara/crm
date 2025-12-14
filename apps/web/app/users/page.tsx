"use client"

import * as React from "react"
import { Search, Plus, Upload, Download } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { ViewToggle } from "@/components/view-toggle"
import { UserCard } from "@/components/users/user-card"
import { UserTable } from "@/components/users/user-table"
import { UserDrawer } from "@/components/user-drawer"
import { AddUserDrawer } from "@/components/add-user-drawer"
import { type UserFormData } from "@/components/users/user-form"
import { ImportDialog } from "@/components/import-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useUsers, useCreateUser, useImportUsers } from "@/lib/hooks"
import { type User, mapUserToUser } from "@/lib/types"
import { SearchOperator } from "@crm/shared"
import { toast } from "sonner"

// Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value)

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export default function UsersPage() {
  const [view, setView] = React.useState<"grid" | "table">("grid")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedUser, setSelectedUser] = React.useState<User | null>(null)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [addDrawerOpen, setAddDrawerOpen] = React.useState(false)
  const [importDialogOpen, setImportDialogOpen] = React.useState(false)

  // Debounce search to avoid too many API calls
  const debouncedSearch = useDebounce(searchQuery, 300)

  // Fetch users using React Query
  const { data, isLoading, isError, error } = useUsers({
    queries: debouncedSearch
      ? [{ field: 'name', operator: SearchOperator.ILIKE, value: debouncedSearch }]
      : [],
    sortOrder: 'asc',
    limit: 100,
    offset: 0,
  })

  // Mutations
  const createUser = useCreateUser()
  const importUsers = useImportUsers()

  // Map API response to User type
  const users: User[] = React.useMemo(() => {
    if (!data?.items) return []
    return data.items.map(mapUserToUser)
  }, [data?.items])

  // Client-side filtering for immediate feedback while debounced search loads
  const filteredUsers = React.useMemo(() => {
    if (!searchQuery || searchQuery === debouncedSearch) {
      return users
    }
    // Do client-side filtering while waiting for API
    const query = searchQuery.toLowerCase()
    return users.filter((user) =>
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      (user.role?.toLowerCase().includes(query) ?? false) ||
      (user.department?.toLowerCase().includes(query) ?? false)
    )
  }, [users, searchQuery, debouncedSearch])

  const handleSelectUser = (user: User) => {
    setSelectedUser(user)
    setDrawerOpen(true)
  }

  const handleAddUser = async (data: UserFormData) => {
    try {
      await createUser.mutateAsync({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        managerEmails: data.reportsTo || [],
        companyDomains: data.assignedCompanies || [],
      })
      toast.success("User created successfully")
      setAddDrawerOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user")
    }
  }

  const handleEditUser = async (id: string, data: UserFormData) => {
    try {
      // TODO: Implement user update API
      console.log("Updating user:", id, data)
      toast.success("User updated successfully")
      setDrawerOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user")
    }
  }

  const handleImport = async (records: Record<string, string>[]) => {
    // Convert records to a file-like object for the API
    // For now, we'll log and show a message
    console.log("Import records:", records)
    toast.info("Import functionality coming soon")
    setImportDialogOpen(false)
  }

  const handleExport = async () => {
    // Generate CSV from current users
    const headers = ["Name", "Email", "Role", "Department", "Status"]
    const rows = filteredUsers.map(user => [
      user.name,
      user.email,
      user.role || "",
      user.department || "",
      user.status,
    ])

    const csv = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "users.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Users</h1>
            <p className="text-muted-foreground">Manage user access and reporting structure</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => setAddDrawerOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, role, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <ViewToggle view={view} onViewChange={setView} />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="text-center py-12">
            <p className="text-destructive">
              Failed to load users: {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        )}

        {/* Data loaded */}
        {!isLoading && !isError && (
          <>
            {view === "grid" ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredUsers.map((user) => (
                  <UserCard key={user.id} user={user} onClick={() => handleSelectUser(user)} />
                ))}
              </div>
            ) : (
              <UserTable users={filteredUsers} onSelect={handleSelectUser} />
            )}

            {filteredUsers.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No users found matching your search.</p>
              </div>
            )}
          </>
        )}

        <UserDrawer
          user={selectedUser}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSave={handleEditUser}
        />

        <AddUserDrawer
          open={addDrawerOpen}
          onClose={() => setAddDrawerOpen(false)}
          onSave={handleAddUser}
          isLoading={createUser.isPending}
        />

        <ImportDialog
          open={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          onImport={handleImport}
          entityType="users"
        />
      </div>
    </AppShell>
  )
}
