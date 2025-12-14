import type { Company, Employee } from "./data"
import type { User } from "./types"

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function exportCustomersToCSV(customers: Company[]): void {
  const headers = [
    "Name",
    "Domains",
    "Tier",
    "Labels",
    "Sentiment",
    "Churn Risk",
    "Total Emails",
    "Avg TAT",
    "Escalations",
  ]

  const rows = customers.map((c) => [
    escapeCSV(c.name),
    escapeCSV(c.domains.join(", ")),
    escapeCSV(c.tier),
    escapeCSV(c.labels?.join(", ") || ""),
    escapeCSV(c.sentiment),
    escapeCSV(c.churnRisk),
    c.totalEmails.toString(),
    c.avgTAT,
    c.escalations.toString(),
  ])

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
  downloadCSV(csv, "customers-export.csv")
}

export function exportUsersToCSV(users: User[]): void {
  const headers = ["Name", "Email", "Role", "Department", "Status"]

  const rows = users.map((u) => [
    escapeCSV(u.name),
    escapeCSV(u.email),
    escapeCSV(u.role || ""),
    escapeCSV(u.department || ""),
    escapeCSV(u.status),
  ])

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
  downloadCSV(csv, "users-export.csv")
}

/**
 * @deprecated Use exportUsersToCSV instead
 * Kept for backwards compatibility during migration
 */
export function exportEmployeesToCSV(employees: Employee[]): void {
  const headers = ["Name", "Email", "Role", "Department", "Status"]

  const rows = employees.map((e) => [
    escapeCSV(e.name),
    escapeCSV(e.email),
    escapeCSV(e.role),
    escapeCSV(e.department),
    escapeCSV(e.status),
  ])

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
  downloadCSV(csv, "employees-export.csv")
}

function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
