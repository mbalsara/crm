"use client"

import { useState } from "react"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown, Clock, Mail, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Company } from "@/lib/types"
import { cn } from "@/lib/utils"
import { TablePagination } from "@/components/ui/table-pagination"

interface CustomerTableProps {
  companies: Company[]
  onSelect: (company: Company) => void
}

const SentimentIcon = ({ sentiment }: { sentiment: Company["sentiment"] }) => {
  const icons = {
    Positive: TrendingUp,
    Negative: TrendingDown,
    Neutral: Minus,
  }
  const Icon = icons[sentiment]
  return <Icon className="mr-1 h-3 w-3" />
}

export function CustomerTable({ companies, onSelect }: CustomerTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const columns: ColumnDef<Company>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Company
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const company = row.original
        return (
          <div>
            <div className="font-medium">{company.name}</div>
            <span className="text-xs text-muted-foreground">@{company.domains[0]}</span>
          </div>
        )
      },
    },
    {
      accessorKey: "labels",
      header: "Labels",
      cell: ({ row }) => {
        const labels = row.original.labels
        if (labels.length === 0) return <span className="text-muted-foreground text-xs">-</span>
        return (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <Badge key={label} variant="secondary" className="text-xs">
                {label}
              </Badge>
            ))}
          </div>
        )
      },
    },
    {
      accessorKey: "totalEmails",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          <Mail className="mr-1 h-3 w-3" />
          Emails
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-medium">{row.getValue("totalEmails")}</span>,
    },
    {
      accessorKey: "avgTAT",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          <Clock className="mr-1 h-3 w-3" />
          Avg TAT
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
    },
    {
      accessorKey: "escalations",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          <AlertTriangle className="mr-1 h-3 w-3" />
          Escalations
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const escalations = row.getValue("escalations") as number
        return <span className={cn("font-medium", escalations > 0 && "text-red-500")}>{escalations}</span>
      },
    },
    {
      accessorKey: "sentiment",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Sentiment
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const sentiment = row.getValue("sentiment") as Company["sentiment"]
        return (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              sentiment === "Positive" && "border-green-500 text-green-500",
              sentiment === "Negative" && "border-red-500 text-red-500",
              sentiment === "Neutral" && "border-amber-500 text-amber-500",
            )}
          >
            <SentimentIcon sentiment={sentiment} />
            {sentiment}
          </Badge>
        )
      },
    },
    {
      accessorKey: "churnRisk",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Risk
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const risk = row.getValue("churnRisk") as Company["churnRisk"]
        return (
          <Badge
            className={cn(
              "text-xs",
              risk === "Low" && "bg-green-500/10 text-green-500 border-0",
              risk === "Medium" && "bg-amber-500/10 text-amber-500 border-0",
              risk === "High" && "bg-red-500/10 text-red-500 border-0",
            )}
          >
            {risk}
          </Badge>
        )
      },
    },
    {
      accessorKey: "lastContact",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Last Contact
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.getValue("lastContact")}</span>,
    },
  ]

  const table = useReactTable({
    data: companies,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  })

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => onSelect(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination table={table} />
    </div>
  )
}
