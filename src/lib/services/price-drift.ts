import { SupabaseClient } from '@supabase/supabase-js'
import { RecurringCharge, PriceChange, Transaction } from '@/types'
import { differenceInMonths, parseISO } from 'date-fns'

/**
 * Price Drift Detection
 * Identifies and tracks price changes for recurring charges
 */

interface PriceChangeDetection {
  recurringChargeId: string
  merchantId: string
  previousAmount: number
  newAmount: number
  changeAmount: number
  changePercent: number
  detectedAt: Date
  transactionId?: string
}

/**
 * Calculate price drift metrics
 */
export function calculateDriftMetrics(
  firstAmount: number,
  currentAmount: number,
  firstDate: Date,
  lastDate: Date
): {
  totalChange: number
  percentChange: number
  annualizedIncrease: number
  monthsTracked: number
} {
  const totalChange = currentAmount - firstAmount
  const percentChange = firstAmount > 0 
    ? ((currentAmount - firstAmount) / firstAmount) * 100 
    : 0
  
  const monthsTracked = differenceInMonths(lastDate, firstDate)
  
  // Annualized increase using compound growth formula
  // ((current/first)^(12/months) - 1) * 100
  let annualizedIncrease = 0
  if (firstAmount > 0 && monthsTracked > 0) {
    const growthRatio = currentAmount / firstAmount
    annualizedIncrease = (Math.pow(growthRatio, 12 / monthsTracked) - 1) * 100
  }
  
  return {
    totalChange,
    percentChange,
    annualizedIncrease,
    monthsTracked
  }
}

/**
 * Detect price changes in transactions for a recurring charge
 */
export function detectPriceChanges(
  transactions: Transaction[],
  recurringCharge: RecurringCharge
): PriceChangeDetection[] {
  const changes: PriceChangeDetection[] = []
  
  // Sort transactions by date
  const sortedTx = [...transactions]
    .filter(tx => tx.merchant_id === recurringCharge.merchant_id && !tx.pending)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  
  if (sortedTx.length < 2) return changes
  
  // Look for significant price changes (> 1% to avoid floating point issues)
  for (let i = 1; i < sortedTx.length; i++) {
    const prev = sortedTx[i - 1]
    const curr = sortedTx[i]
    
    const change = curr.amount - prev.amount
    const percentChange = prev.amount > 0 
      ? (change / prev.amount) * 100 
      : 0
    
    // Only track if change is significant (> 1%)
    if (Math.abs(percentChange) > 1) {
      changes.push({
        recurringChargeId: recurringCharge.id,
        merchantId: recurringCharge.merchant_id,
        previousAmount: prev.amount,
        newAmount: curr.amount,
        changeAmount: change,
        changePercent: percentChange,
        detectedAt: parseISO(curr.date),
        transactionId: curr.id
      })
    }
  }
  
  return changes
}

/**
 * Save price changes to database
 */
export async function savePriceChanges(
  supabase: SupabaseClient,
  userId: string,
  changes: PriceChangeDetection[]
): Promise<number> {
  if (changes.length === 0) return 0
  
  const records = changes.map(change => ({
    recurring_charge_id: change.recurringChargeId,
    user_id: userId,
    merchant_id: change.merchantId,
    previous_amount: change.previousAmount,
    new_amount: change.newAmount,
    change_amount: change.changeAmount,
    change_percent: change.changePercent,
    detected_at: change.detectedAt.toISOString().split('T')[0],
    transaction_id: change.transactionId
  }))
  
  // Use upsert to avoid duplicates
  const { error, count } = await supabase
    .from('price_changes')
    .upsert(records, {
      onConflict: 'recurring_charge_id,detected_at',
      ignoreDuplicates: true
    })
  
  if (error) {
    console.error('Error saving price changes:', error)
    return 0
  }
  
  return count || records.length
}

/**
 * Run price change detection for all recurring charges of a user
 */
export async function runPriceChangeDetection(
  supabase: SupabaseClient,
  userId: string
): Promise<{ detected: number; saved: number }> {
  // Fetch recurring charges
  const { data: recurringCharges, error: rcError } = await supabase
    .from('recurring_charges')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
  
  if (rcError || !recurringCharges) {
    throw new Error(`Failed to fetch recurring charges: ${rcError?.message}`)
  }
  
  // Fetch all transactions
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('pending', false)
    .order('date', { ascending: true })
  
  if (txError || !transactions) {
    throw new Error(`Failed to fetch transactions: ${txError?.message}`)
  }
  
  let totalDetected = 0
  let totalSaved = 0
  
  for (const rc of recurringCharges) {
    const changes = detectPriceChanges(transactions, rc)
    totalDetected += changes.length
    
    if (changes.length > 0) {
      const saved = await savePriceChanges(supabase, userId, changes)
      totalSaved += saved
      
      // Update the recurring charge with latest amount
      const latestAmount = changes[changes.length - 1].newAmount
      await supabase
        .from('recurring_charges')
        .update({ 
          current_amount: latestAmount,
          last_seen_at: changes[changes.length - 1].detectedAt.toISOString().split('T')[0]
        })
        .eq('id', rc.id)
    }
  }
  
  return { detected: totalDetected, saved: totalSaved }
}

/**
 * Get price drift summary for dashboard
 */
export async function getPriceDriftSummary(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('price_drift_summary')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('percent_change', { ascending: false })
  
  if (error) {
    throw new Error(`Failed to fetch price drift summary: ${error.message}`)
  }
  
  return data || []
}

/**
 * Get merchant price history
 */
export async function getMerchantPriceHistory(
  supabase: SupabaseClient,
  userId: string,
  merchantId: string
) {
  // Fetch merchant details
  const { data: merchant, error: mError } = await supabase
    .from('merchants')
    .select('*')
    .eq('id', merchantId)
    .eq('user_id', userId)
    .single()
  
  if (mError || !merchant) {
    throw new Error(`Merchant not found: ${mError?.message}`)
  }
  
  // Fetch recurring charge
  const { data: recurringCharge } = await supabase
    .from('recurring_charges')
    .select('*')
    .eq('merchant_id', merchantId)
    .eq('user_id', userId)
    .single()
  
  // Fetch price changes
  const { data: priceChanges } = await supabase
    .from('price_changes')
    .select('*')
    .eq('merchant_id', merchantId)
    .eq('user_id', userId)
    .order('detected_at', { ascending: true })
  
  // Fetch transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('merchant_id', merchantId)
    .eq('user_id', userId)
    .eq('pending', false)
    .order('date', { ascending: true })
  
  // Calculate summary
  let summary = null
  if (recurringCharge) {
    const metrics = calculateDriftMetrics(
      recurringCharge.first_amount,
      recurringCharge.current_amount,
      parseISO(recurringCharge.first_seen_at),
      parseISO(recurringCharge.last_seen_at)
    )
    
    summary = {
      first_price: recurringCharge.first_amount,
      current_price: recurringCharge.current_amount,
      percent_change: metrics.percentChange,
      annualized_increase: metrics.annualizedIncrease,
      months_tracked: metrics.monthsTracked
    }
  }
  
  return {
    merchant,
    recurring_charge: recurringCharge,
    price_changes: priceChanges || [],
    transactions: transactions || [],
    summary
  }
}
