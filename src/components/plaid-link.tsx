'use client'

import { useState, useCallback } from 'react'
import { usePlaidLink, PlaidLinkOnSuccess } from 'react-plaid-link'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Link as LinkIcon, Check } from 'lucide-react'

interface PlaidLinkButtonProps {
  onSuccess?: () => void
}

export function PlaidLinkButton({ onSuccess }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const { toast } = useToast()

  const fetchLinkToken = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
      })
      const data = await response.json()
      
      if (data.error) throw new Error(data.error)
      
      setLinkToken(data.link_token)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
      setLoading(false)
    }
  }, [toast])

  const handleOnSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setLoading(true)
      try {
        const response = await fetch('/api/plaid/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_token: publicToken, metadata }),
        })
        
        const data = await response.json()
        
        if (data.error) throw new Error(data.error)
        
        setConnected(true)
        toast({
          title: 'Account Connected',
          description: `Successfully linked ${data.accounts_linked} account(s)`,
        })
        
        onSuccess?.()
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to link account'
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    },
    [toast, onSuccess]
  )

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleOnSuccess,
    onExit: () => {
      setLoading(false)
    },
  })

  const handleClick = async () => {
    if (!linkToken) {
      await fetchLinkToken()
    }
  }

  // Open Plaid Link once token is ready
  if (linkToken && ready && loading) {
    open()
    setLoading(false)
  }

  if (connected) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <Check className="w-4 h-4 text-green-500" />
        Connected
      </Button>
    )
  }

  return (
    <Button 
      onClick={handleClick} 
      disabled={loading}
      className="gap-2"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <LinkIcon className="w-4 h-4" />
          Connect Bank
        </>
      )}
    </Button>
  )
}
