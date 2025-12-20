'use client'

import * as React from 'react'
import { useRoles } from '@/lib/hooks'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SystemRoleSelectProps {
  value: string | null | undefined
  onChange: (roleId: string | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * Dropdown for selecting RBAC system roles (User, Manager, Administrator)
 */
export function SystemRoleSelect({
  value,
  onChange,
  placeholder = 'Select role...',
  disabled = false,
  className,
}: SystemRoleSelectProps) {
  const { data: roles, isLoading } = useRoles()

  return (
    <Select
      value={value || ''}
      onValueChange={(v) => onChange(v || null)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={isLoading ? 'Loading...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {roles?.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
