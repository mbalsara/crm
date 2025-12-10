"use client"

import * as React from "react"
import { Upload, FileText, X, Download, AlertCircle, CheckCircle2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ImportDialogProps {
  open: boolean
  onClose: () => void
  onImport: (data: Record<string, string>[]) => void
  entityType: "customers" | "employees"
}

const templateColumns = {
  customers: ["name", "domains", "serviceType", "labels"],
  employees: ["name", "email", "role", "department"],
}

const templateExamples = {
  customers: [
    { name: "Acme Corp", domains: "acme.com,acme.io", serviceType: "Retainer", labels: "Premier,Enterprise" },
    { name: "TechStart", domains: "techstart.io", serviceType: "Time & Material", labels: "Subscription" },
  ],
  employees: [
    { name: "John Doe", email: "john@company.com", role: "Account Manager", department: "Sales" },
    { name: "Jane Smith", email: "jane@company.com", role: "Support Lead", department: "Support" },
  ],
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n")
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0])
  const records: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header.trim()] = values[index]?.trim() || ""
    })
    records.push(record)
  }

  return records
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

function generateTemplate(entityType: "customers" | "employees"): string {
  const columns = templateColumns[entityType]
  const examples = templateExamples[entityType]

  const header = columns.join(",")
  const rows = examples.map((ex) =>
    columns
      .map((col) => {
        const val = ex[col as keyof typeof ex] || ""
        return val.includes(",") ? `"${val}"` : val
      })
      .join(","),
  )

  return [header, ...rows].join("\n")
}

export function ImportDialog({ open, onClose, onImport, entityType }: ImportDialogProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [parsedData, setParsedData] = React.useState<Record<string, string>[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      processFile(droppedFile)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      processFile(selectedFile)
    }
  }

  const processFile = async (file: File) => {
    setError(null)

    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file")
      return
    }

    try {
      const text = await file.text()
      const data = parseCSV(text)

      if (data.length === 0) {
        setError("No valid records found in the file")
        return
      }

      setFile(file)
      setParsedData(data)
    } catch (err) {
      setError("Failed to parse the file")
    }
  }

  const handleDownloadTemplate = () => {
    const template = generateTemplate(entityType)
    const blob = new Blob([template], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${entityType}-template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    onImport(parsedData)
    handleClose()
  }

  const handleClose = () => {
    setFile(null)
    setParsedData([])
    setError(null)
    onClose()
  }

  const handleRemoveFile = () => {
    setFile(null)
    setParsedData([])
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import {entityType === "customers" ? "Customers" : "Employees"}</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import {entityType}. Download the template to see the required format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </Button>

          {!file ? (
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-medium">Drag and drop your CSV file here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
            </div>
          ) : (
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {parsedData.length} record{parsedData.length !== 1 ? "s" : ""} found
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={handleRemoveFile}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>File parsed successfully</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={parsedData.length === 0}>
              Import {parsedData.length > 0 && `(${parsedData.length})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
