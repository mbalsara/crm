"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useUsers } from "@/lib/hooks"

interface UserAutocompleteProps {
  value: string | null // userId or email depending on valueField
  onChange: (value: string | null, userName?: string, userEmail?: string) => void
  valueField?: 'id' | 'email' // Which field to use as value (default: 'id')
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  excludeIds?: Set<string> | string[]
  excludeEmails?: Set<string> | string[]
  onlyLoginable?: boolean // Only show users who can login (default: false)
}

export function UserAutocomplete({
  value,
  onChange,
  valueField = 'id',
  placeholder = "Select user...",
  searchPlaceholder = "Search users...",
  emptyText = "No users found.",
  disabled = false,
  className,
  excludeIds,
  excludeEmails,
  onlyLoginable = false,
}: UserAutocompleteProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  // Fetch all users
  const { data: usersData, isLoading, error } = useUsers({
    queries: [],
    sortBy: 'firstName',
    sortOrder: 'asc',
    limit: 500,
    offset: 0,
  })

  // Debug logging
  React.useEffect(() => {
    if (error) {
      console.error('UserAutocomplete: Error fetching users:', error)
    }
    if (usersData) {
      console.log('UserAutocomplete: Loaded users:', usersData.items?.length || 0)
    }
  }, [usersData, error])

  // Convert exclude arrays to Sets for efficient lookup
  const excludeIdSet = React.useMemo(() => {
    if (!excludeIds) return new Set<string>()
    return excludeIds instanceof Set ? excludeIds : new Set(excludeIds)
  }, [excludeIds])

  const excludeEmailSet = React.useMemo(() => {
    if (!excludeEmails) return new Set<string>()
    return excludeEmails instanceof Set ? excludeEmails : new Set(excludeEmails)
  }, [excludeEmails])

  // Transform and filter users
  const users = React.useMemo(() => {
    const items = usersData?.items || []

    // Filter out excluded users and optionally filter by canLogin
    const filtered = items.filter(user => {
      // Keep currently selected user even if in exclude list or not loginable
      const currentValue = valueField === 'email' ? user.email : user.id
      if (currentValue === value) return true

      // Filter by canLogin if onlyLoginable is set
      if (onlyLoginable && user.canLogin === false) return false

      if (excludeIdSet.has(user.id)) return false
      if (excludeEmailSet.has(user.email)) return false
      return true
    })

    // Sort by name
    return filtered.sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase()
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [usersData, excludeIdSet, excludeEmailSet, value, valueField, onlyLoginable])

  // Filter by search query
  const filteredUsers = React.useMemo(() => {
    if (!search) return users
    const searchLower = search.toLowerCase()
    return users.filter(user => {
      const name = `${user.firstName} ${user.lastName}`.toLowerCase()
      const email = user.email.toLowerCase()
      return name.includes(searchLower) || email.includes(searchLower)
    })
  }, [users, search])

  // Find selected user
  const selectedUser = React.useMemo(() => {
    if (!value) return null
    return users.find(user =>
      valueField === 'email' ? user.email === value : user.id === value
    )
  }, [users, value, valueField])

  const handleSelect = (user: typeof users[0]) => {
    const newValue = valueField === 'email' ? user.email : user.id
    const name = `${user.firstName} ${user.lastName}`

    if (newValue === value) {
      // Deselect
      onChange(null)
    } else {
      onChange(newValue, name, user.email)
    }
    setOpen(false)
  }

  // Reset search when closing
  React.useEffect(() => {
    if (!open) {
      setSearch("")
    }
  }, [open])

  const displayText = selectedUser
    ? `${selectedUser.firstName} ${selectedUser.lastName} (${selectedUser.email})`
    : isLoading
      ? "Loading users..."
      : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn("w-full justify-between bg-transparent", className)}
        >
          <span className="truncate">{displayText}</span>
          {isLoading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto h-4 w-4 animate-spin mb-2" />
                Loading users...
              </div>
            ) : filteredUsers.length === 0 ? (
              <CommandEmpty>{emptyText}</CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredUsers.map((user) => {
                  const itemValue = valueField === 'email' ? user.email : user.id
                  const isSelected = value === itemValue
                  const name = `${user.firstName} ${user.lastName}`

                  return (
                    <CommandItem
                      key={user.id}
                      value={user.id}
                      onSelect={() => handleSelect(user)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{name} ({user.email})</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
