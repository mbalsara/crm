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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Customer } from "@/lib/types"
import { cn } from "@/lib/utils"
import { TablePagination } from "@/components/ui/table-pagination"

interface CustomerTableProps {
  customers: Customer[]
  onSelect: (customer: Customer) => void
}

const SentimentIcon = ({ sentiment }: { sentiment: Customer["sentiment"] }) => {
  const icons = {
    Positive: TrendingUp,
    Negative: TrendingDown,
    Neutral: Minus,
  }
  const Icon = icons[sentiment]
  return <Icon className="mr-1 h-3 w-3" />
}

export function CustomerTable({ customers, onSelect }: CustomerTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const columns: ColumnDef<Customer>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Customer
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const customer = row.original
        return (
          <div>
            <div className="font-medium">{customer.name}</div>
            <span className="text-xs text-muted-foreground">@{customer.domains[0]}</span>
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
        const sentiment = row.getValue("sentiment") as Customer["sentiment"]
        const confidence = row.original.sentimentConfidence
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs cursor-default",
                  sentiment === "Positive" && "border-green-500 text-green-500",
                  sentiment === "Negative" && "border-red-500 text-red-500",
                  sentiment === "Neutral" && "border-amber-500 text-amber-500",
                )}
              >
                <SentimentIcon sentiment={sentiment} />
                {sentiment}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {confidence
                ? `${sentiment} (${Math.round(confidence * 100)}% confidence)`
                : sentiment}
            </TooltipContent>
          </Tooltip>
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
        const risk = row.getValue("churnRisk") as Customer["churnRisk"]
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
    data: customers,
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
