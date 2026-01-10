import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPriceDriftSummary } from '@/lib/services/price-drift'

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get price drift summary
    const driftSummary = await getPriceDriftSummary(supabase, user.id)
    
    // Get account info
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, institution_name, account_name, mask, last_sync_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
    
    // Get stats
    const { count: transactionCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
    
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
    
    return NextResponse.json({
      drift_summary: driftSummary,
      accounts: accounts || [],
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
