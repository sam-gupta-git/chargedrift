import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPriceDriftSummary } from '@/lib/services/price-drift'

// Disable caching for this route
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get price drift summary
    const driftSummary = await getPriceDriftSummary(supabase, user.id)
    
    // Get all recurring charges (including ones without price changes)
    // Filter out excluded merchants
    const { data: allRecurring } = await supabase
      .from('recurring_charges')
      .select(`
        id,
        merchant_id,
        frequency,
        first_amount,
        current_amount,
        first_seen_at,
        last_seen_at,
        transaction_count,
        is_active,
        merchants!inner (
          id,
          name,
          is_excluded
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('merchants.is_excluded', false)
      .order('current_amount', { ascending: false })
    
    // Get merchant to account mapping (which accounts have transactions for which merchants)
    const { data: merchantAccounts } = await supabase
      .from('transactions')
      .select('merchant_id, account_id')
      .eq('user_id', user.id)
      .not('merchant_id', 'is', null)
    
    // Build a map of merchant_id -> account_ids[]
    const merchantToAccounts: Record<string, string[]> = {}
    if (merchantAccounts) {
      for (const tx of merchantAccounts) {
        if (!tx.merchant_id) continue
        if (!merchantToAccounts[tx.merchant_id]) {
          merchantToAccounts[tx.merchant_id] = []
        }
        if (!merchantToAccounts[tx.merchant_id].includes(tx.account_id)) {
          merchantToAccounts[tx.merchant_id].push(tx.account_id)
        }
      }
    }
    
    // Add account_ids to recurring charges
    const recurringWithAccounts = (allRecurring || []).map(rc => ({
      ...rc,
      account_ids: merchantToAccounts[rc.merchant_id] || []
    }))
    
    // Get account info
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, institution_name, account_name, account_type, mask, last_sync_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
    
    // Get transaction counts per account for filtering info
    const { data: txCountsByAccount } = await supabase
      .from('transactions')
      .select('account_id')
      .eq('user_id', user.id)
    
    const accountTxCounts: Record<string, number> = {}
    if (txCountsByAccount) {
      for (const tx of txCountsByAccount) {
        accountTxCounts[tx.account_id] = (accountTxCounts[tx.account_id] || 0) + 1
      }
    }
    
    // Add transaction counts to accounts
    const accountsWithCounts = (accounts || []).map(acc => ({
      ...acc,
      transaction_count: accountTxCounts[acc.id] || 0
    }))
    
    // Get stats
    const { count: transactionCount, error: txCountError } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
    
    console.log('=== DASHBOARD DEBUG ===')
    console.log('User ID:', user.id)
    console.log('Transaction count:', transactionCount, 'Error:', txCountError?.message)
    console.log('Accounts:', accounts?.length)
    console.log('Tx by account:', accountTxCounts)
    
    const { count: recurringCount } = await supabase
      .from('recurring_charges')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)
    
    // Get user info
    const { data: userData } = await supabase
      .from('users')
      .select('last_sync_at')
      .eq('id', user.id)
      .single()
    
    // Add account_ids to drift summary too
    const driftWithAccounts = driftSummary.map(d => ({
      ...d,
      account_ids: merchantToAccounts[d.merchant_id] || []
    }))

    return NextResponse.json({
      drift_summary: driftWithAccounts,
      all_recurring: recurringWithAccounts,
      accounts: accountsWithCounts,
      stats: {
        total_transactions: transactionCount || 0,
        recurring_charges: recurringCount || 0,
        price_increases: driftSummary.filter(d => d.percent_change > 0).length,
      },
      last_sync_at: userData?.last_sync_at,
    })
  } catch (error) {
    console.error('Error fetching dashboard:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
