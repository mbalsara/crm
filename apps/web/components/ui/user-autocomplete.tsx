"use client"

import * as React from "react"
import { VirtualizedCombobox, type ComboboxItem } from "./virtualized-combobox"
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
}: UserAutocompleteProps) {
  // Fetch all users
  const { data: usersData } = useUsers({
    queries: [],
    sortBy: 'firstName',
    sortOrder: 'asc',
    limit: 500,
    offset: 0,
  })

  // Convert exclude arrays to Sets for efficient lookup
  const excludeIdSet = React.useMemo(() => {
    if (!excludeIds) return new Set<string>()
    return excludeIds instanceof Set ? excludeIds : new Set(excludeIds)
  }, [excludeIds])

  const excludeEmailSet = React.useMemo(() => {
    if (!excludeEmails) return new Set<string>()
    return excludeEmails instanceof Set ? excludeEmails : new Set(excludeEmails)
  }, [excludeEmails])

  // Transform users to ComboboxItem format
  const items = React.useMemo((): ComboboxItem[] => {
    const userItems = usersData?.items?.map(user => {
      const name = `${user.firstName} ${user.lastName}`
      const itemValue = valueField === 'email' ? user.email : user.id
      return {
        value: itemValue,
        label: `${name} (${user.email})`,
        searchText: `${name} ${user.email}`,
        // Store extra data
        _id: user.id,
        _name: name,
        _email: user.email,
      }
    }) || []

    // Filter out excluded IDs/emails (but keep the currently selected one)
    const filtered = userItems.filter(item => {
      const user = usersData?.items?.find(u =>
        valueField === 'email' ? u.email === item.value : u.id === item.value
      )
      if (!user) return false

      // Check if excluded
      if (excludeIdSet.has(user.id) && item.value !== value) return false
      if (excludeEmailSet.has(user.email) && item.value !== value) return false

      return true
    })

    // Sort by label (case-insensitive)
    return filtered.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    )
  }, [usersData, excludeIdSet, excludeEmailSet, value, valueField])

  // Keep a map for quick lookup of user details
  const userMap = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string }>()
    usersData?.items?.forEach(user => {
      const name = `${user.firstName} ${user.lastName}`
      // Index by both id and email for flexible lookup
      map.set(user.id, { id: user.id, name, email: user.email })
      map.set(user.email, { id: user.id, name, email: user.email })
    })
    return map
  }, [usersData])

  const handleChange = (selectedValue: string | null) => {
    if (selectedValue) {
      const user = userMap.get(selectedValue)
      onChange(selectedValue, user?.name, user?.email)
    } else {
      onChange(null)
    }
  }

  return (
    <VirtualizedCombobox
      items={items}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      disabled={disabled}
      className={className}
    />
  )
}
