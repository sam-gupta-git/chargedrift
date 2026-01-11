'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Upload, FileText, Download } from 'lucide-react'
import { generateSampleCSV } from '@/lib/services/csv-parser'

interface CSVUploadProps {
  onSuccess?: () => void
}

export function CSVUpload({ onSuccess }: CSVUploadProps) {
  const [loading, setLoading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importName, setImportName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload a CSV file',
        variant: 'destructive',
      })
      return
    }
    setSelectedFile(file)
    // Default name to the file name
    if (!importName) {
      setImportName(file.name)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    
    let finalName = importName.trim()
    if (!finalName) {
      finalName = selectedFile.name
    }
    if (!finalName.endsWith('.csv')) {
      finalName += '.csv'
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('name', finalName)

      const response = await fetch('/api/csv/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.details?.join(', ') || data.error)
      }

      toast({
        title: 'CSV Imported',
        description: `Added ${data.transactions.added} transactions to "${finalName}". Found ${data.recurring_detected} recurring charges.`,
      })

      if (data.warnings?.length > 0) {
        toast({
          title: 'Import Warnings',
          description: data.warnings.join('; '),
        })
      }

      // Reset state
      setSelectedFile(null)
      setImportName('')
      onSuccess?.()
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to import CSV'
      toast({
        title: 'Import Failed',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleClear = () => {
    setSelectedFile(null)
    setImportName('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const downloadSample = () => {
    const csv = generateSampleCSV()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample-transactions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {!selectedFile ? (
        <>
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              disabled={loading}
            />

            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">Drop your CSV file here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  or click to browse
                </p>
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                Select CSV File
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              CSV should have Date, Description, and Amount columns
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadSample}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <Download className="w-3 h-3" />
              Download Sample
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                Change
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-name">Import Name</Label>
            <Input
              id="import-name"
              placeholder="e.g., chase-2024.csv"
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Give this import a name to identify it later (must end in .csv)
            </p>
          </div>

          <Button 
            onClick={handleUpload} 
            disabled={loading} 
            className="w-full gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import Transactions
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
