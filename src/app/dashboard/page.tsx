'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PriceDriftSummary } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PlaidLinkButton } from '@/components/plaid-link'
import { SyncButton } from '@/components/sync-button'
import { PriceDriftTable } from '@/components/price-drift-table'
import { formatDate } from '@/lib/utils'
import { LogOut, TrendingUp, CreditCard, AlertCircle, Loader2 } from 'lucide-react'

interface DashboardData {
  drift_summary: PriceDriftSummary[]
  accounts: { id: string; institution_name: string; account_name: string; mask: string }[]
  stats: {
    total_transactions: number
    recurring_charges: number
    price_increases: number
  }
  last_sync_at: string | null
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const fetchDashboard = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard')
      const result = await response.json()
      
      if (result.error) throw new Error(result.error)
      
      setData(result)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }

  const handleSync = () => {
    fetchDashboard()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-lg font-semibold">Error loading dashboard</p>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const hasAccounts = data && data.accounts.length > 0

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">
              <span className="text-foreground">Charge</span>
              <span className="text-primary">Drift</span>
            </h1>
            <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
              Dashboard
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {hasAccounts && <SyncButton onSync={handleSync} />}
            <PlaidLinkButton onSuccess={handleSync} />
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="opacity-0 animate-fade-in stagger-1">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Linked Accounts
              </CardTitle>
              <CreditCard className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.accounts.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {data?.stats.total_transactions || 0} transactions
              </p>
            </CardContent>
          </Card>

          <Card className="opacity-0 animate-fade-in stagger-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Recurring Charges
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.stats.recurring_charges || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Auto-detected subscriptions
              </p>
            </CardContent>
          </Card>

          <Card className="opacity-0 animate-fade-in stagger-3">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Price Increases
              </CardTitle>
              <AlertCircle className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {data?.stats.price_increases || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Merchants charging more
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Last sync info */}
        {data?.last_sync_at && (
          <p className="text-sm text-muted-foreground mb-6">
            Last synced: {formatDate(data.last_sync_at)}
          </p>
        )}

        {/* Connected accounts */}
        {!hasAccounts ? (
          <Card className="opacity-0 animate-fade-in stagger-4">
            <CardContent className="py-12 text-center">
              <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Connect Your Bank</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Link your bank account to start tracking recurring charges and detecting price drift.
              </p>
              <PlaidLinkButton onSuccess={handleSync} />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Linked accounts list */}
            {data.accounts.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-medium text-muted-foreground mb-3">Linked Accounts</h2>
                <div className="flex flex-wrap gap-2">
                  {data.accounts.map((account) => (
                    <div
                      key={account.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm"
                    >
                      <CreditCard className="w-3 h-3" />
                      <span>{account.institution_name}</span>
                      {account.mask && (
                        <span className="text-muted-foreground">•••• {account.mask}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Price drift table */}
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Top Price Increases
              </h2>
              <PriceDriftTable items={data?.drift_summary || []} />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
