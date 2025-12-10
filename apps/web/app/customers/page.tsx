"use client"

import * as React from "react"
import { Search, Plus, Upload, Download } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { ViewToggle } from "@/components/view-toggle"
import { CustomerCard } from "@/components/customers/customer-card"
import { CustomerTable } from "@/components/customers/customer-table"
import { CompanyDrawer } from "@/components/company-drawer"
import { AddCustomerDrawer, type CustomerFormData } from "@/components/add-customer-drawer"
import { ImportDialog } from "@/components/import-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useCompanies, useUpsertCompany } from "@/lib/hooks"
import { type Company, mapApiCompanyToCompany } from "@/lib/types"
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

export default function CustomersPage() {
  const [view, setView] = React.useState<"grid" | "table">("grid")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedCompany, setSelectedCompany] = React.useState<Company | null>(null)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [addDrawerOpen, setAddDrawerOpen] = React.useState(false)
  const [importDialogOpen, setImportDialogOpen] = React.useState(false)

  // Debounce search to avoid too many API calls
  const debouncedSearch = useDebounce(searchQuery, 300)

  // Fetch companies using React Query
  const { data, isLoading, isError, error } = useCompanies({
    queries: debouncedSearch
      ? [{ field: 'name', operator: SearchOperator.ILIKE, value: debouncedSearch }]
      : [],
    sortOrder: 'asc',
    limit: 100,
    offset: 0,
  })

  // Mutations
  const upsertCompany = useUpsertCompany()

  // Map API response to Company type
  const companies: Company[] = React.useMemo(() => {
    if (!data?.items) return []
    return data.items.map(mapApiCompanyToCompany)
  }, [data?.items])

  // Client-side filtering for immediate feedback
  const filteredCompanies = React.useMemo(() => {
    if (!searchQuery || searchQuery === debouncedSearch) {
      return companies
    }
    const query = searchQuery.toLowerCase()
    return companies.filter((company) =>
      company.name.toLowerCase().includes(query) ||
      company.domains.some((d) => d.toLowerCase().includes(query))
    )
  }, [companies, searchQuery, debouncedSearch])

  const handleSelectCompany = (company: Company) => {
    setSelectedCompany(company)
    setDrawerOpen(true)
  }

  const handleAddCustomer = async (customerData: CustomerFormData) => {
    try {
      await upsertCompany.mutateAsync({
        tenantId: customerData.tenantId,
        domains: customerData.domains,
        name: customerData.name,
        website: customerData.website,
        industry: customerData.industry,
      })
      toast.success("Customer created successfully")
      setAddDrawerOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create customer")
    }
  }

  const handleImport = async (records: Record<string, string>[]) => {
    console.log("Import records:", records)
    toast.info("Import functionality coming soon")
    setImportDialogOpen(false)
  }

  const handleExport = () => {
    // Generate CSV from current companies
    const headers = ["Name", "Domains", "Industry", "Website"]
    const rows = filteredCompanies.map(company => [
      company.name,
      company.domains.join("; "),
      company.industry || "",
      company.website || "",
    ])

    const csv = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "customers.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
            <p className="text-muted-foreground">Manage and monitor all customer accounts</p>
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
              Add Customer
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by company, domain, contact, or labels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <ViewToggle view={view} onViewChange={setView} />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="text-center py-12">
            <p className="text-destructive">
              Failed to load customers: {error instanceof Error ? error.message : "Unknown error"}
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
              <div className="grid gap-4 md:grid-cols-2">
                {filteredCompanies.map((company) => (
                  <CustomerCard key={company.id} company={company} onClick={() => handleSelectCompany(company)} />
                ))}
              </div>
            ) : (
              <CustomerTable companies={filteredCompanies} onSelect={handleSelectCompany} />
            )}

            {filteredCompanies.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No customers found matching your search.</p>
              </div>
            )}
          </>
        )}

        <CompanyDrawer company={selectedCompany} open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        <AddCustomerDrawer
          open={addDrawerOpen}
          onClose={() => setAddDrawerOpen(false)}
          onSave={handleAddCustomer}
          isLoading={upsertCompany.isPending}
        />

        <ImportDialog
          open={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          onImport={handleImport}
          entityType="customers"
        />
      </div>
    </AppShell>
  )
}
