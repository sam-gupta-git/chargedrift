'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { MerchantPriceHistory } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatPercent, formatDate, formatFrequency, getChangeColor } from '@/lib/utils'
import { ArrowLeft, TrendingUp, TrendingDown, Calendar, Loader2, AlertCircle, DollarSign, EyeOff } from 'lucide-react'

export default function MerchantPage() {
  const params = useParams()
  const merchantId = params.id as string
  
  const [data, setData] = useState<MerchantPriceHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [excluding, setExcluding] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const fetchMerchant = async () => {
      try {
        const response = await fetch(`/api/merchants/${merchantId}`)
        const result = await response.json()
        
        if (result.error) throw new Error(result.error)
        
        setData(result)
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load merchant'
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    fetchMerchant()
  }, [merchantId])

  const handleExclude = async () => {
    setExcluding(true)
    try {
      const response = await fetch(`/api/merchants/${merchantId}/exclude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excluded: true }),
      })
      
      const result = await response.json()
      if (result.error) throw new Error(result.error)
      
      toast({
        title: 'Merchant Hidden',
        description: `${data?.merchant.name} will no longer appear in your dashboard.`,
      })
      
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to hide merchant'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setExcluding(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-lg font-semibold">Error loading merchant</p>
          <p className="text-muted-foreground">{error}</p>
          <Link href="/dashboard">
            <Button className="mt-4">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  const { merchant, recurring_charge, price_changes, transactions, summary } = data

  // Calculate total spent and date range
  const totalSpent = transactions.reduce((sum, tx) => sum + tx.amount, 0)
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  const firstDate = sortedTransactions.length > 0 ? sortedTransactions[0].date : null
  const lastDate = sortedTransactions.length > 0 ? sortedTransactions[sortedTransactions.length - 1].date : null

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link 
            href="/dashboard"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{merchant.name}</h1>
              {recurring_charge && (
                <p className="text-muted-foreground mt-1">
                  {formatFrequency(recurring_charge.frequency)} subscription
                </p>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {summary && (
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${summary.percent_change > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                  {summary.percent_change > 0 ? (
                    <TrendingUp className="w-5 h-5 text-red-500" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-green-500" />
                  )}
                  <span className={`text-lg font-bold ${getChangeColor(summary.percent_change)}`}>
                    {formatPercent(summary.percent_change)}
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExclude}
                disabled={excluding}
                className="gap-2 text-muted-foreground hover:text-destructive hover:border-destructive"
              >
                <EyeOff className="w-4 h-4" />
                {excluding ? 'Hiding...' : 'Hide'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Total Spent Card */}
        {transactions.length > 0 && (
          <Card className="mb-8 opacity-0 animate-fade-in bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Spent</p>
                    <p className="text-3xl font-bold font-mono text-primary">
                      {formatCurrency(totalSpent)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Date Range</p>
                  <p className="font-medium">
                    {firstDate && lastDate ? (
                      <>
                        {formatDate(firstDate)} — {formatDate(lastDate)}
                      </>
                    ) : (
                      'N/A'
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="opacity-0 animate-fade-in stagger-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  First Price
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold font-mono">
                  {formatCurrency(summary.first_price)}
                </div>
              </CardContent>
            </Card>

            <Card className="opacity-0 animate-fade-in stagger-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Current Price
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold font-mono">
                  {formatCurrency(summary.current_price)}
                </div>
              </CardContent>
            </Card>

            <Card className="opacity-0 animate-fade-in stagger-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Annualized Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold font-mono ${getChangeColor(summary.annualized_increase)}`}>
                  {formatPercent(summary.annualized_increase)}/yr
                </div>
              </CardContent>
            </Card>

            <Card className="opacity-0 animate-fade-in stagger-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Tracking Period
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">
                  {summary.months_tracked} mo
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Explanation */}
        {summary && summary.percent_change !== 0 && (
          <Card className="mb-8 opacity-0 animate-fade-in stagger-5">
            <CardContent className="py-6">
              <h3 className="font-semibold mb-2">What this means</h3>
              <p className="text-muted-foreground">
                {merchant.name} has {summary.percent_change > 0 ? 'increased' : 'decreased'} their price from{' '}
                <span className="text-foreground font-medium">{formatCurrency(summary.first_price)}</span> to{' '}
                <span className="text-foreground font-medium">{formatCurrency(summary.current_price)}</span>,{' '}
                a change of <span className={`font-medium ${getChangeColor(summary.percent_change)}`}>
                  {formatPercent(summary.percent_change)}
                </span>.
                {summary.months_tracked >= 12 && (
                  <>
                    {' '}Over the {summary.months_tracked} months you&apos;ve been tracked, this equates to an annualized rate of{' '}
                    <span className={`font-medium ${getChangeColor(summary.annualized_increase)}`}>
                      {formatPercent(summary.annualized_increase)}
                    </span> per year.
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Price change history */}
        {price_changes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Price Change History
            </h2>
            <div className="space-y-2">
              {price_changes.map((change, index) => (
                <div
                  key={change.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-card opacity-0 animate-slide-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-muted-foreground">
                      {formatDate(change.detected_at)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{formatCurrency(change.previous_amount)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono font-semibold">{formatCurrency(change.new_amount)}</span>
                    </div>
                  </div>
                  <div className={`font-mono font-bold ${getChangeColor(change.change_percent)}`}>
                    {formatPercent(change.change_percent)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction history */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            All Transactions ({transactions.length})
          </h2>
          <div className="space-y-1">
            {transactions.map((tx, index) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-card transition-colors opacity-0 animate-fade-in"
                style={{ animationDelay: `${0.5 + index * 0.03}s` }}
              >
                <div className="text-sm text-muted-foreground">
                  {formatDate(tx.date)}
                </div>
                <div className="font-mono">
                  {formatCurrency(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
