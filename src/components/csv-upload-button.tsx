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
      <DialogContent className="sm:max-w-[380px] w-[90vw] overflow-hidden p-4">
        <DialogHeader className="pr-6">
          <DialogTitle className="text-base">Import Transactions</DialogTitle>
          <DialogDescription className="text-xs">
            Upload a CSV file from your bank.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden">
          <CSVUpload onSuccess={handleSuccess} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
