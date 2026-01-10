'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, RefreshCw } from 'lucide-react'

interface SyncButtonProps {
  onSync?: () => void
}

export function SyncButton({ onSync }: SyncButtonProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSync = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/plaid/sync-transactions', {
        method: 'POST',
      })
      
      const data = await response.json()
      
      if (data.error) throw new Error(data.error)
      
      toast({
        title: 'Sync Complete',
        description: `Added ${data.transactions.added} transactions. Found ${data.recurring_detected} recurring charges with ${data.price_changes_detected} price changes.`,
      })
      
      onSync?.()
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync'
      toast({
        title: 'Sync Failed',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleSync} disabled={loading} variant="outline" className="gap-2">
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Syncing...
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4" />
          Sync Transactions
        </>
      )}
    </Button>
  )
}
