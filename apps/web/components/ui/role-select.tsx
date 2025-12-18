'use client'

import * as React from 'react'
import { CUSTOMER_ROLES_LIST, type CustomerRole } from '@crm/shared'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface RoleSelectProps {
  value: string | null
  onChange: (roleId: string | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function RoleSelect({
  value,
  onChange,
  placeholder = 'Select role...',
  disabled = false,
  className,
}: RoleSelectProps) {
  return (
    <Select
      value={value || ''}
      onValueChange={(v) => onChange(v || null)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {CUSTOMER_ROLES_LIST.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
