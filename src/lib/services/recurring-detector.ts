import { SupabaseClient } from '@supabase/supabase-js'
import { Transaction, RecurringFrequency } from '@/types'
import { differenceInDays, parseISO } from 'date-fns'

/**
 * Recurring Charge Detector
 * Analyzes transactions to identify recurring patterns
 */

interface TransactionGroup {
  merchantId: string
  transactions: Transaction[]
  amounts: number[]
  dates: Date[]
}

interface FrequencyPattern {
  frequency: RecurringFrequency
  minDays: number
  maxDays: number
  weight: number
}

const FREQUENCY_PATTERNS: FrequencyPattern[] = [
  { frequency: 'weekly', minDays: 5, maxDays: 9, weight: 1 },
  { frequency: 'biweekly', minDays: 12, maxDays: 16, weight: 1 },
  { frequency: 'monthly', minDays: 27, maxDays: 35, weight: 1.2 }, // Most common
  { frequency: 'quarterly', minDays: 85, maxDays: 100, weight: 0.8 },
  { frequency: 'yearly', minDays: 355, maxDays: 375, weight: 0.6 },
]

// Minimum requirements for recurring detection
const MIN_TRANSACTIONS = 2
const MIN_CONFIDENCE = 0.5
const AMOUNT_TOLERANCE = 0.15 // 15% variance allowed

/**
 * Detect the frequency of transactions based on date intervals
 */
function detectFrequency(dates: Date[]): { frequency: RecurringFrequency; confidence: number } | null {
  if (dates.length < MIN_TRANSACTIONS) return null
  
  // Sort dates chronologically
  const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime())
  
  // Calculate intervals between consecutive transactions
  const intervals: number[] = []
  for (let i = 1; i < sortedDates.length; i++) {
    intervals.push(differenceInDays(sortedDates[i], sortedDates[i - 1]))
  }
  
  if (intervals.length === 0) return null
  
  // Find the most common interval pattern
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
  
  // Match against known frequency patterns
  let bestMatch: FrequencyPattern | null = null
  let bestScore = 0
  
  for (const pattern of FREQUENCY_PATTERNS) {
    if (avgInterval >= pattern.minDays && avgInterval <= pattern.maxDays) {
      // Calculate how many intervals match this pattern
      const matchingIntervals = intervals.filter(
        i => i >= pattern.minDays && i <= pattern.maxDays
      ).length
      
      const score = (matchingIntervals / intervals.length) * pattern.weight
      
      if (score > bestScore) {
        bestScore = score
        bestMatch = pattern
      }
    }
  }
  
  if (!bestMatch || bestScore < MIN_CONFIDENCE) return null
  
  return {
    frequency: bestMatch.frequency,
    confidence: Math.min(bestScore, 1)
  }
}

/**
 * Check if amounts are consistent (recurring charges usually have same/similar amounts)
 */
function checkAmountConsistency(amounts: number[]): { consistent: boolean; confidenceBoost: number } {
  if (amounts.length < 2) return { consistent: false, confidenceBoost: 0 }
  
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
  
  // Check how many amounts are within tolerance of average
  const consistentCount = amounts.filter(
    amount => Math.abs(amount - avgAmount) / avgAmount <= AMOUNT_TOLERANCE
  ).length
  
  const ratio = consistentCount / amounts.length
  
  return {
    consistent: ratio >= 0.7, // 70% of amounts should be consistent
    confidenceBoost: ratio * 0.2 // Boost confidence by up to 20%
  }
}

/**
 * Group transactions by merchant
 */
function groupByMerchant(transactions: Transaction[]): Map<string, TransactionGroup> {
  const groups = new Map<string, TransactionGroup>()
  
  for (const tx of transactions) {
    if (!tx.merchant_id || tx.pending) continue
    
    const existing = groups.get(tx.merchant_id)
    if (existing) {
      existing.transactions.push(tx)
      existing.amounts.push(tx.amount)
      existing.dates.push(parseISO(tx.date))
    } else {
      groups.set(tx.merchant_id, {
        merchantId: tx.merchant_id,
        transactions: [tx],
        amounts: [tx.amount],
        dates: [parseISO(tx.date)]
      })
    }
  }
  
  return groups
}

export interface DetectedRecurring {
  merchantId: string
  frequency: RecurringFrequency
  confidence: number
  firstAmount: number
  currentAmount: number
  firstDate: Date
  lastDate: Date
  transactionCount: number
}

/**
 * Detect recurring charges from transactions
 */
export function detectRecurringCharges(transactions: Transaction[]): DetectedRecurring[] {
  const groups = groupByMerchant(transactions)
  const recurring: DetectedRecurring[] = []
  
  for (const [merchantId, group] of Array.from(groups.entries())) {
    if (group.transactions.length < MIN_TRANSACTIONS) continue
    
    const frequencyResult = detectFrequency(group.dates)
    if (!frequencyResult) continue
    
    const amountCheck = checkAmountConsistency(group.amounts)
    if (!amountCheck.consistent) continue
    
    // Sort dates to get first and last
    const sortedDates = group.dates.sort((a, b) => a.getTime() - b.getTime())
    
    // Sort transactions by date to get first and current amount
    const sortedTx = group.transactions.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    
    recurring.push({
      merchantId,
      frequency: frequencyResult.frequency,
      confidence: Math.min(frequencyResult.confidence + amountCheck.confidenceBoost, 1),
      firstAmount: sortedTx[0].amount,
      currentAmount: sortedTx[sortedTx.length - 1].amount,
      firstDate: sortedDates[0],
      lastDate: sortedDates[sortedDates.length - 1],
      transactionCount: group.transactions.length
    })
  }
  
  return recurring
}

/**
 * Save detected recurring charges to database
 */
export async function saveRecurringCharges(
  supabase: SupabaseClient,
  userId: string,
  detected: DetectedRecurring[]
): Promise<number> {
  let savedCount = 0
  
  for (const charge of detected) {
    const { error } = await supabase
      .from('recurring_charges')
      .upsert({
        user_id: userId,
        merchant_id: charge.merchantId,
        frequency: charge.frequency,
        confidence_score: charge.confidence,
        first_seen_at: charge.firstDate.toISOString().split('T')[0],
        last_seen_at: charge.lastDate.toISOString().split('T')[0],
        first_amount: charge.firstAmount,
        current_amount: charge.currentAmount,
        transaction_count: charge.transactionCount,
        is_active: true
      }, {
        onConflict: 'user_id,merchant_id,frequency'
      })
    
    if (!error) savedCount++
  }
  
  return savedCount
}

/**
 * Run recurring charge detection for a user
 */
export async function runRecurringDetection(
  supabase: SupabaseClient,
  userId: string
): Promise<{ detected: number; saved: number }> {
  // Fetch all transactions for the user
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('pending', false)
    .order('date', { ascending: true })
  
  if (error || !transactions) {
    throw new Error(`Failed to fetch transactions: ${error?.message}`)
  }
  
  const detected = detectRecurringCharges(transactions)
  const saved = await saveRecurringCharges(supabase, userId, detected)
  
  return { detected: detected.length, saved }
}
