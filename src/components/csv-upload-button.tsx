'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CSVUpload } from '@/components/csv-upload'
import { FileText } from 'lucide-react'

interface CSVUploadButtonProps {
  onSuccess?: () => void
}

export function CSVUploadButton({ onSuccess }: CSVUploadButtonProps) {
  const [open, setOpen] = useState(false)

  const handleSuccess = () => {
    setOpen(false)
    onSuccess?.()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileText className="w-4 h-4" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Transactions</DialogTitle>
          <DialogDescription>
            Upload a CSV file from your bank to import transactions.
          </DialogDescription>
        </DialogHeader>
        <CSVUpload onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  )
}
