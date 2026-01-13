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
import { CSVUpload } from '@/components/csv-upload'
import { CSVUploadButton } from '@/components/csv-upload-button'
import { formatDate, formatCurrency, formatFrequency, cn } from '@/lib/utils'
import { LogOut, TrendingUp, CreditCard, AlertCircle, Loader2, FileText, RefreshCcw, X, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import Link from 'next/link'

interface RecurringCharge {
  id: string
  merchant_id: string
  frequency: string
  first_amount: number
  current_amount: number
  first_seen_at: string
  last_seen_at: string
  transaction_count: number
  is_active: boolean
  account_ids: string[]
  merchants: {
    id: string
    name: string
  }
}

interface Account {
  id: string
  institution_name: string
  account_name: string
  account_type: string
  mask: string
  transaction_count: number
}

interface DashboardData {
  drift_summary: PriceDriftSummary[]
  all_recurring: RecurringCharge[]
  accounts: Account[]
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
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const fetchDashboard = useCallback(async () => {
    try {
      // Add cache-busting timestamp to force fresh data
      const response = await fetch(`/api/dashboard?t=${Date.now()}`, {
        cache: 'no-store',
      })
      const result = await response.json()
      
      if (result.error) throw new Error(result.error)
      
      setData(result)
      setError(null)
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

  const handleSync = async () => {
    setLoading(true)
    await fetchDashboard()
    // Force re-render by updating a key
    router.refresh()
  }

  const handleAccountClick = (accountId: string) => {
    if (selectedAccountId === accountId) {
      setSelectedAccountId(null)
    } else {
      setSelectedAccountId(accountId)
    }
  }

  const handleDeleteAccount = async (accountId: string, accountName: string) => {
    if (!confirm(`Are you sure you want to delete "${accountName}" and all its transactions? This cannot be undone.`)) {
      return
    }

    setDeletingAccountId(accountId)
    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.error) {
        throw new Error(result.error)
      }

      toast({
        title: 'Account Deleted',
        description: `"${accountName}" and all its transactions have been removed.`,
      })

      // Clear selection if we deleted the selected account
      if (selectedAccountId === accountId) {
        setSelectedAccountId(null)
      }

      // Refresh dashboard
      fetchDashboard()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete account'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setDeletingAccountId(null)
    }
  }

  const selectedAccount = data?.accounts.find(a => a.id === selectedAccountId)

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
            {hasAccounts && <CSVUploadButton onSuccess={handleSync} />}
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
          <div className="grid md:grid-cols-2 gap-6 opacity-0 animate-fade-in stagger-4">
            {/* Plaid Option */}
            <Card>
              <CardContent className="py-8 text-center">
                <CreditCard className="w-10 h-10 text-primary mx-auto mb-4" />
                <h2 className="text-lg font-semibold mb-2">Connect Your Bank</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  Securely link your bank account via Plaid for automatic transaction sync.
                </p>
                <PlaidLinkButton onSuccess={handleSync} />
              </CardContent>
            </Card>
            
            {/* CSV Option */}
            <Card>
              <CardContent className="py-8">
                <div className="text-center mb-4">
                  <FileText className="w-10 h-10 text-primary mx-auto mb-4" />
                  <h2 className="text-lg font-semibold mb-2">Upload CSV</h2>
                  <p className="text-muted-foreground text-sm mb-4">
                    Import transactions from your bank&apos;s CSV export.
                  </p>
                </div>
                <CSVUpload onSuccess={handleSync} />
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {/* Linked accounts list */}
            {data.accounts.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-muted-foreground">Linked Accounts & Imports</h2>
                  {selectedAccountId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedAccountId(null)}
                      className="text-xs text-muted-foreground"
                    >
                      Clear filter
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.accounts.map((account) => {
                    const isCSV = account.institution_name === 'CSV Import'
                    const isSelected = selectedAccountId === account.id
                    const isDeleting = deletingAccountId === account.id
                    return (
                      <button
                        key={account.id}
                        onClick={() => handleAccountClick(account.id)}
                        disabled={isDeleting}
                        className={cn(
                          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80",
                          isDeleting && "opacity-50"
                        )}
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isCSV ? (
                          <FileText className={cn("w-3 h-3", isSelected ? "text-primary-foreground" : "text-primary")} />
                        ) : (
                          <CreditCard className="w-3 h-3" />
                        )}
                        <span>{isCSV ? account.account_name : account.institution_name}</span>
                        {!isCSV && account.mask && (
                          <span className={isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}>
                            •••• {account.mask}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Selected account info */}
                {selectedAccount && (
                  <div className="mt-4 p-4 rounded-lg border border-border bg-card animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">
                          {selectedAccount.institution_name === 'CSV Import' 
                            ? selectedAccount.account_name 
                            : selectedAccount.institution_name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {selectedAccount.transaction_count} transaction{selectedAccount.transaction_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteAccount(
                          selectedAccount.id,
                          selectedAccount.institution_name === 'CSV Import' 
                            ? selectedAccount.account_name 
                            : selectedAccount.institution_name
                        )}
                        disabled={deletingAccountId === selectedAccount.id}
                        className="gap-2"
                      >
                        {deletingAccountId === selectedAccount.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Price drift table */}
            {(() => {
              // Filter price drift by selected account
              const filteredDrift = selectedAccountId
                ? data?.drift_summary?.filter((d: { account_ids?: string[] }) => 
                    d.account_ids?.includes(selectedAccountId)
                  ) || []
                : data?.drift_summary || []
              
              if (filteredDrift.length === 0) return null
              
              return (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    {selectedAccountId ? 'Price Increases (Filtered)' : 'Top Price Increases'}
                  </h2>
                  <PriceDriftTable items={filteredDrift} />
                </div>
              )
            })()}

            {/* All recurring charges */}
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <RefreshCcw className="w-5 h-5 text-primary" />
                {selectedAccountId ? 'Recurring Charges (Filtered)' : 'All Recurring Charges'}
              </h2>
              {(() => {
                // Filter recurring charges by selected account
                const filteredCharges = selectedAccountId
                  ? data?.all_recurring?.filter(charge => 
                      charge.account_ids?.includes(selectedAccountId)
                    ) || []
                  : data?.all_recurring || []
                
                if (filteredCharges.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                      {selectedAccountId ? (
                        <>
                          <p>No recurring charges found for this account.</p>
                          <p className="text-sm mt-1">Try selecting a different account or clear the filter.</p>
                        </>
                      ) : (
                        <>
                          <p>No recurring charges detected yet.</p>
                          <p className="text-sm mt-1">Import more transactions to detect patterns.</p>
                        </>
                      )}
                    </div>
                  )
                }
                
                // Helper to get account name from ID
                const getAccountName = (accountId: string) => {
                  const account = data?.accounts?.find(a => a.id === accountId)
                  if (!account) return null
                  return account.institution_name === 'CSV Import' 
                    ? account.account_name 
                    : account.institution_name
                }
                
                return (
                  <div className="space-y-2">
                    {filteredCharges.map((charge, index) => (
                      <Link
                        key={charge.id}
                        href={`/merchant/${charge.merchant_id}`}
                        className="block p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-all hover:border-primary/50 opacity-0 animate-fade-in"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{charge.merchants?.name || 'Unknown'}</h3>
                            <p className="text-sm text-muted-foreground">
                              {formatFrequency(charge.frequency)} · {charge.transaction_count} transactions
                              {!selectedAccountId && charge.account_ids?.length > 0 && (
                                <span className="text-muted-foreground/70">
                                  {' · '}
                                  {charge.account_ids.map(id => getAccountName(id)).filter(Boolean).join(', ')}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-semibold">{formatCurrency(charge.current_amount)}</p>
                            {charge.first_amount !== charge.current_amount && (
                              <p className="text-xs text-muted-foreground">
                                was {formatCurrency(charge.first_amount)}
                              </p>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )
              })()}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
