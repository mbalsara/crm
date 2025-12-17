"use client"

import * as React from "react"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { X, Plus, Search, Pencil, Trash2, Mail, Phone, Building2, Globe, Check, Tag, Loader2, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { EmailDrawer } from "@/components/email-drawer"
import {
  InboxView,
  apiEmailToInboxItem,
  apiEmailToInboxContent,
  type InboxItem,
  type InboxFilter,
  type InboxPagination,
  type InboxPage,
  type InboxItemContent,
  type ApiEmailResponse,
} from "@/components/inbox"
import type { Company, Contact, Email } from "@/lib/types"
import { predefinedLabels, mapApiContactToContact } from "@/lib/types"
import { useEmailsByCompany, useContactsByCompany } from "@/lib/hooks"
import { authService } from "@/lib/auth/auth-service"

interface CompanyDrawerProps {
  company: Company | null
  open: boolean
  onClose: () => void
  activeTab?: "contacts" | "emails"
  onTabChange?: (tab: string) => void
  isLoading?: boolean
}

export function CompanyDrawer({ company, open, onClose, activeTab = "contacts", onTabChange, isLoading = false }: CompanyDrawerProps) {
  const [contactSearch, setContactSearch] = React.useState("")
  const [editingContact, setEditingContact] = React.useState<string | null>(null)
  const [addingContact, setAddingContact] = React.useState(false)
  const [editForm, setEditForm] = React.useState<Contact | null>(null)
  const [newContact, setNewContact] = React.useState<Omit<Contact, "id">>({
    name: "",
    email: "",
    phone: "",
    title: "",
  })
  const [selectedEmail, setSelectedEmail] = React.useState<Email | null>(null)
  const [emailDrawerOpen, setEmailDrawerOpen] = React.useState(false)
  const [isEditingLabels, setIsEditingLabels] = React.useState(false)
  const [labels, setLabels] = React.useState<string[]>([])
  const [labelPopoverOpen, setLabelPopoverOpen] = React.useState(false)
  const [newLabelInput, setNewLabelInput] = React.useState("")
  const [contactSorting, setContactSorting] = React.useState<SortingState>([])

  // Get tenantId from auth service
  const tenantId = authService.getTenantId() || ""

  // Fetch all emails for company from API (high limit to fetch all)
  const {
    data: emailsData,
    isLoading: isLoadingEmails,
    error: emailsError,
  } = useEmailsByCompany(tenantId, company?.id || "", { limit: 10000 })

  // Fetch contacts for company from API
  const {
    data: contactsData,
    isLoading: isLoadingContacts,
  } = useContactsByCompany(company?.id || "")

  // Map API contacts to frontend Contact type (already sorted by API)
  const contacts: Contact[] = React.useMemo(() => {
    if (!contactsData) return []
    return contactsData.map(mapApiContactToContact)
  }, [contactsData])

  // Reset state when drawer closes or company changes
  React.useEffect(() => {
    if (!open) {
      setEditingContact(null)
      setAddingContact(false)
      setEditForm(null)
      setNewContact({ name: "", email: "", phone: "", title: "" })
      setSelectedEmail(null)
      setEmailDrawerOpen(false)
      setIsEditingLabels(false)
      setLabelPopoverOpen(false)
      setNewLabelInput("")
    }
    if (company) {
      setLabels(company.labels)
    }
  }, [open, company])

  // Get emails from API response
  const emails: ApiEmailResponse[] = emailsData?.emails || []

  // Email inbox callbacks for InboxView
  const emailCallbacks = React.useMemo(() => {
    if (!company) return null

    return {
      onFetchItems: async (
        filter: InboxFilter,
        pagination: InboxPagination
      ): Promise<InboxPage<InboxItem>> => {
        // Filter emails by search query (client-side for now)
        let filteredEmails = [...emails]

        if (filter.query) {
          const query = filter.query.toLowerCase()
          filteredEmails = filteredEmails.filter(
            (email) =>
              email.fromEmail.toLowerCase().includes(query) ||
              (email.fromName?.toLowerCase().includes(query) ?? false) ||
              email.subject.toLowerCase().includes(query) ||
              (email.body?.toLowerCase().includes(query) ?? false)
          )
        }

        // Paginate
        const start = (pagination.page - 1) * pagination.limit
        const paginatedEmails = filteredEmails.slice(start, start + pagination.limit)

        return {
          items: paginatedEmails.map(apiEmailToInboxItem),
          total: filteredEmails.length,
          page: pagination.page,
          limit: pagination.limit,
          hasMore: start + pagination.limit < filteredEmails.length,
        }
      },
      onFetchContent: async (itemId: string): Promise<InboxItemContent> => {
        const email = emails.find((e) => e.id === itemId)
        if (!email) {
          throw new Error(`Email not found: ${itemId}`)
        }
        return apiEmailToInboxContent(email)
      },
      onSelect: (item: InboxItem) => {
        // Optional: track selection externally
        console.log("Selected email:", item.id)
      },
      onReply: (item: InboxItem) => {
        // Convert API email to frontend Email type for the drawer
        const apiEmail = emails.find((e) => e.id === item.id)
        if (apiEmail) {
          const email: Email = {
            id: apiEmail.id,
            from: apiEmail.fromEmail,
            to: apiEmail.tos?.[0]?.email || "",
            subject: apiEmail.subject,
            body: apiEmail.body || "",
            date: apiEmail.receivedAt,
          }
          setSelectedEmail(email)
          setEmailDrawerOpen(true)
        }
      },
      onForward: (item: InboxItem) => {
        // Convert API email to frontend Email type for the drawer
        const apiEmail = emails.find((e) => e.id === item.id)
        if (apiEmail) {
          const email: Email = {
            id: apiEmail.id,
            from: apiEmail.fromEmail,
            to: apiEmail.tos?.[0]?.email || "",
            subject: apiEmail.subject,
            body: apiEmail.body || "",
            date: apiEmail.receivedAt,
          }
          setSelectedEmail(email)
          setEmailDrawerOpen(true)
        }
      },
    }
  }, [company, emails])

  // Filter contacts by search - must be before any early returns
  const filteredContacts = React.useMemo(() => {
    return contacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        contact.email.toLowerCase().includes(contactSearch.toLowerCase()) ||
        contact.title?.toLowerCase().includes(contactSearch.toLowerCase()),
    )
  }, [contacts, contactSearch])

  // Contact table columns with sorting - must be before any early returns
  const contactColumns: ColumnDef<Contact>[] = React.useMemo(() => [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
    },
    {
      accessorKey: "title",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Title
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
    },
    {
      accessorKey: "email",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Contact
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const contact = row.original
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-sm">
              <Mail className="h-3 w-3 text-muted-foreground" />
              {contact.email}
            </div>
            {contact.phone && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Phone className="h-3 w-3" />
                {contact.phone}
              </div>
            )}
          </div>
        )
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const contact = row.original
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleStartEdit(contact)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => handleDelete(contact.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      },
    },
  ], [])

  const contactTable = useReactTable({
    data: filteredContacts,
    columns: contactColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setContactSorting,
    state: {
      sorting: contactSorting,
    },
  })

  // Show loading state or return null if no company and not loading
  // This must come AFTER all hooks are called
  if (!company) {
    if (!open) return null

    // Show loading state when drawer is open but company is still loading
    return (
      <>
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 transition-opacity opacity-100"
          onClick={onClose}
        />
        {/* Drawer with loading state */}
        <div className="fixed right-0 top-0 z-50 h-full w-full transform bg-background border-l border-border shadow-xl translate-x-0">
          <div className="flex h-full flex-col items-center justify-center">
            {isLoading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Loading customer...</p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-4">Customer not found</p>
                <Button variant="outline" onClick={onClose}>Close</Button>
              </>
            )}
          </div>
        </div>
      </>
    )
  }

  const handleStartEdit = (contact: Contact) => {
    setEditingContact(contact.id)
    setEditForm({ ...contact })
    setAddingContact(false)
  }

  const handleCancelEdit = () => {
    setEditingContact(null)
    setEditForm(null)
  }

  const handleSaveEdit = () => {
    console.log("Saving contact:", editForm)
    setEditingContact(null)
    setEditForm(null)
  }

  const handleStartAdd = () => {
    setAddingContact(true)
    setEditingContact(null)
    setEditForm(null)
  }

  const handleCancelAdd = () => {
    setAddingContact(false)
    setNewContact({ name: "", email: "", phone: "", title: "" })
  }

  const handleSaveAdd = () => {
    console.log("Adding contact:", newContact)
    setAddingContact(false)
    setNewContact({ name: "", email: "", phone: "", title: "" })
  }

  const handleDelete = (contactId: string) => {
    console.log("Deleting contact:", contactId)
  }

  const handleAddLabel = (label: string) => {
    if (!labels.includes(label)) {
      setLabels([...labels, label])
    }
    setLabelPopoverOpen(false)
    setNewLabelInput("")
  }

  const handleRemoveLabel = (label: string) => {
    setLabels(labels.filter((l) => l !== label))
  }

  const handleSaveLabels = () => {
    console.log("Saving labels:", labels)
    setIsEditingLabels(false)
  }

  const availableLabels = predefinedLabels.filter(
    (label) => !labels.includes(label) && label.toLowerCase().includes(newLabelInput.toLowerCase()),
  )

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-background/80 backdrop-blur-sm z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer - Always full width */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-full transform bg-background border-l border-border shadow-xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{company.name}</h2>
                  <Badge variant={company.tier === "Premier" ? "default" : "secondary"} className="text-xs">
                    {company.tier}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  {company.domains.join(", ")}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Labels Section */}
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Tag className="h-4 w-4 text-muted-foreground" />
                Labels
              </div>
              {!isEditingLabels ? (
                <Button variant="ghost" size="sm" onClick={() => setIsEditingLabels(true)}>
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLabels(company.labels)
                      setIsEditingLabels(false)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveLabels}>
                    <Check className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => (
                <Badge key={label} variant="secondary" className="text-xs">
                  {label}
                  {isEditingLabels && (
                    <button className="ml-1 hover:text-destructive" onClick={() => handleRemoveLabel(label)}>
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
              {isEditingLabels && (
                <Popover open={labelPopoverOpen} onOpenChange={setLabelPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 text-xs bg-transparent">
                      <Plus className="h-3 w-3 mr-1" />
                      Add Label
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search or add..."
                        value={newLabelInput}
                        onValueChange={setNewLabelInput}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {newLabelInput && (
                            <button
                              className="w-full px-2 py-1.5 text-sm text-left hover:bg-accent"
                              onClick={() => handleAddLabel(newLabelInput)}
                            >
                              Create "{newLabelInput}"
                            </button>
                          )}
                        </CommandEmpty>
                        <CommandGroup>
                          {availableLabels.map((label) => (
                            <CommandItem key={label} value={label} onSelect={() => handleAddLabel(label)}>
                              {label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
              {labels.length === 0 && !isEditingLabels && (
                <span className="text-sm text-muted-foreground">No labels</span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs
              value={activeTab}
              onValueChange={(v) => onTabChange?.(v)}
              className="h-full flex flex-col"
            >
              <TabsList className="mx-6 mt-6 mb-0 flex-shrink-0">
                <TabsTrigger value="contacts">
                  Contacts {isLoadingContacts ? <Loader2 className="ml-1 h-3 w-3 animate-spin" /> : `(${contacts.length})`}
                </TabsTrigger>
                <TabsTrigger value="emails">
                  Emails {isLoadingEmails ? <Loader2 className="ml-1 h-3 w-3 animate-spin" /> : `(${emailsData?.total ?? 0})`}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="contacts" className="flex-1 flex flex-col overflow-hidden mt-0">
                {/* Toolbar - matches InboxView toolbar structure */}
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search contacts..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="pl-9 h-8"
                    />
                  </div>
                  <Button size="sm" className="h-8" onClick={handleStartAdd} disabled={addingContact}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Contact
                  </Button>
                </div>
                {/* Content */}
                <div className="flex-1 overflow-auto p-4 space-y-4">
                  {/* Add Contact Form */}
                  {addingContact && (
                    <div className="rounded-lg border border-primary bg-primary/5 p-4 space-y-4">
                      <h4 className="font-medium">New Contact</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="new-name">Name</Label>
                          <Input
                            id="new-name"
                            value={newContact.name}
                            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                            placeholder="Full name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="new-title">Title</Label>
                          <Input
                            id="new-title"
                            value={newContact.title}
                            onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
                            placeholder="Job title"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="new-email">Email</Label>
                          <Input
                            id="new-email"
                            type="email"
                            value={newContact.email}
                            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                            placeholder="email@company.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="new-phone">Phone</Label>
                          <Input
                            id="new-phone"
                            value={newContact.phone}
                            onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                            placeholder="+1 555-0000"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={handleCancelAdd}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveAdd}>
                          <Check className="mr-2 h-4 w-4" />
                          Save Contact
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      {contactTable.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <TableHead key={header.id} className={header.id === "actions" ? "w-[100px]" : ""}>
                              {header.isPlaceholder
                                ? null
                                : flexRender(header.column.columnDef.header, header.getContext())}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {contactTable.getRowModel().rows?.length ? (
                        contactTable.getRowModel().rows.map((row) => {
                          const contact = row.original
                          return (
                            <React.Fragment key={row.id}>
                              {editingContact === contact.id && editForm ? (
                                <TableRow className="bg-primary/5">
                                  <TableCell colSpan={4} className="p-4">
                                    <div className="space-y-4">
                                      <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                          <Label htmlFor={`edit-name-${contact.id}`}>Name</Label>
                                          <Input
                                            id={`edit-name-${contact.id}`}
                                            value={editForm.name}
                                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label htmlFor={`edit-title-${contact.id}`}>Title</Label>
                                          <Input
                                            id={`edit-title-${contact.id}`}
                                            value={editForm.title}
                                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label htmlFor={`edit-email-${contact.id}`}>Email</Label>
                                          <Input
                                            id={`edit-email-${contact.id}`}
                                            type="email"
                                            value={editForm.email}
                                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label htmlFor={`edit-phone-${contact.id}`}>Phone</Label>
                                          <Input
                                            id={`edit-phone-${contact.id}`}
                                            value={editForm.phone}
                                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                          />
                                        </div>
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                                          Cancel
                                        </Button>
                                        <Button size="sm" onClick={handleSaveEdit}>
                                          <Check className="mr-2 h-4 w-4" />
                                          Save Changes
                                        </Button>
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ) : (
                                <TableRow>
                                  {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id}>
                                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              )}
                            </React.Fragment>
                          )
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center">
                            No contacts found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="emails" className="flex-1 h-0 min-h-0 overflow-hidden mt-0">
                {emailCallbacks && (
                  <InboxView
                    key={`inbox-${company.id}-${emails.length}`}
                    className="h-full"
                    config={{
                      itemType: "email",
                      showSearch: true,
                      showThreadCount: true,
                      searchPlaceholder: "Search emails...",
                      emptyMessage: "No emails found",
                      listPanelWidth: "350px",
                      embedded: true,
                    }}
                    callbacks={emailCallbacks}
                  />
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <EmailDrawer
        email={selectedEmail}
        companyName={company.name}
        open={emailDrawerOpen}
        onClose={() => setEmailDrawerOpen(false)}
      />
    </>
  )
}
