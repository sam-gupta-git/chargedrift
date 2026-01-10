import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { plaidClient } from '@/lib/plaid/client'
import { findOrCreateMerchant } from '@/lib/services/merchant-normalizer'
import { runRecurringDetection } from '@/lib/services/recurring-detector'
import { runPriceChangeDetection } from '@/lib/services/price-drift'
import { RemovedTransaction, Transaction as PlaidTransaction } from 'plaid'

export async function POST() {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get all active accounts for the user
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
    
    if (accountsError || !accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: 'No linked accounts found' },
        { status: 400 }
      )
    }
    
    let totalAdded = 0
    let totalModified = 0
    let totalRemoved = 0
    
    // Sync transactions for each account
    for (const account of accounts) {
      const result = await syncAccountTransactions(
        supabase,
        user.id,
        account.id,
        account.plaid_access_token,
        account.sync_cursor
      )
      
      totalAdded += result.added
      totalModified += result.modified
      totalRemoved += result.removed
      
      // Update account's sync cursor
      if (result.cursor) {
        await supabase
          .from('accounts')
          .update({
            sync_cursor: result.cursor,
            last_sync_at: new Date().toISOString(),
          })
          .eq('id', account.id)
      }
    }
    
    // Run recurring detection and price change detection
    const recurringResult = await runRecurringDetection(supabase, user.id)
    const priceChangeResult = await runPriceChangeDetection(supabase, user.id)
    
    // Update user's last sync time
    await supabase
      .from('users')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', user.id)
    
    return NextResponse.json({
      success: true,
      transactions: {
        added: totalAdded,
        modified: totalModified,
        removed: totalRemoved,
      },
      recurring_detected: recurringResult.detected,
      price_changes_detected: priceChangeResult.detected,
    })
  } catch (error) {
    console.error('Error syncing transactions:', error)
    return NextResponse.json(
      { error: 'Failed to sync transactions' },
      { status: 500 }
    )
  }
}

async function syncAccountTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
  accessToken: string,
  cursor: string | null
): Promise<{ added: number; modified: number; removed: number; cursor: string | null }> {
  let added = 0
  let modified = 0
  let removed = 0
  let hasMore = true
  let nextCursor = cursor
  
  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor: nextCursor || undefined,
      count: 500,
    })
    
    const data = response.data
    
    // Process added transactions
    for (const tx of data.added) {
      await upsertTransaction(supabase, userId, accountId, tx)
      added++
    }
    
    // Process modified transactions
    for (const tx of data.modified) {
      await upsertTransaction(supabase, userId, accountId, tx)
      modified++
    }
    
    // Process removed transactions
    for (const tx of data.removed) {
      await removeTransaction(supabase, userId, tx)
      removed++
    }
    
    hasMore = data.has_more
    nextCursor = data.next_cursor
  }
  
  return { added, modified, removed, cursor: nextCursor }
}

async function upsertTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
  tx: PlaidTransaction
) {
  // Only process positive amounts (debits/charges)
  if (tx.amount <= 0) return
  
  // Get or create merchant
  const merchantName = tx.merchant_name || tx.name
  let merchantId: string | null = null
  
  try {
    merchantId = await findOrCreateMerchant(supabase, userId, merchantName)
  } catch (error) {
    console.error('Error normalizing merchant:', error)
  }
  
  await supabase
    .from('transactions')
    .upsert({
      user_id: userId,
      account_id: accountId,
      merchant_id: merchantId,
      plaid_transaction_id: tx.transaction_id,
      amount: tx.amount,
      date: tx.date,
      name: tx.name,
      merchant_name: tx.merchant_name,
      pending: tx.pending,
      category: tx.category,
    }, {
      onConflict: 'user_id,plaid_transaction_id',
    })
}

async function removeTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tx: RemovedTransaction
) {
  if (!tx.transaction_id) return
  
  await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .eq('plaid_transaction_id', tx.transaction_id)
}
