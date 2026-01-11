import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCSV } from '@/lib/services/csv-parser'
import { findOrCreateMerchant } from '@/lib/services/merchant-normalizer'
import { runRecurringDetection } from '@/lib/services/recurring-detector'
import { runPriceChangeDetection } from '@/lib/services/price-drift'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    let importName = formData.get('name') as string | null
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    // Ensure import name ends with .csv
    if (!importName) {
      importName = file.name
    }
    if (!importName.endsWith('.csv')) {
      importName += '.csv'
    }
    
    // Read file content
    const content = await file.text()
    
    // Debug: Log first few lines
    const lines = content.split(/\r?\n/).slice(0, 5)
    console.log('=== CSV DEBUG ===')
    console.log('First 5 lines:', lines)
    console.log('File size:', content.length, 'bytes')
    
    // Parse CSV
    const parseResult = parseCSV(content)
    
    console.log('Parse result:', {
      transactions: parseResult.transactions.length,
      errors: parseResult.errors.slice(0, 3),
      skipped: parseResult.skipped
    })
    
    if (parseResult.errors.length > 0 && parseResult.transactions.length === 0) {
      return NextResponse.json({
        error: 'Failed to parse CSV',
        details: parseResult.errors.slice(0, 5), // First 5 errors
      }, { status: 400 })
    }
    
    // Create a unique account for this CSV import
    // Use the import name as the identifier
    const accountIdentifier = `csv-${importName}`
    let csvAccountId: string
    
    const { data: existingAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('plaid_account_id', accountIdentifier)
      .single()
    
    if (existingAccount) {
      // Account with this name already exists - update it
      csvAccountId = existingAccount.id
    } else {
      // Create new account for this import
      const { data: newAccount, error: accountError } = await supabase
        .from('accounts')
        .insert({
          user_id: user.id,
          plaid_account_id: accountIdentifier,
          plaid_item_id: 'csv-import',
          plaid_access_token: 'csv-import',
          institution_name: 'CSV Import',
          account_name: importName,
          account_type: 'import',
          is_active: true,
        })
        .select('id')
        .single()
      
      if (accountError || !newAccount) {
        return NextResponse.json({
          error: 'Failed to create import account',
        }, { status: 500 })
      }
      
      csvAccountId = newAccount.id
    }
    
    // Process transactions
    let added = 0
    let skipped = 0
    let errors: string[] = []
    
    console.log('=== INSERTING TRANSACTIONS ===')
    console.log('Account ID:', csvAccountId)
    console.log('Transactions to insert:', parseResult.transactions.length)
    
    for (let idx = 0; idx < parseResult.transactions.length; idx++) {
      const tx = parseResult.transactions[idx]
      // Generate a unique transaction ID using:
      // - Index in file (ensures uniqueness within import)
      // - Date, amount, and partial description (for deduplication across imports)
      // - Import name (to allow same transaction in different imports)
      const uniqueStr = `${tx.date}|${tx.amount}|${tx.description.slice(0, 20)}|${importName}|${idx}`
      const txId = `csv-${Buffer.from(uniqueStr).toString('base64').replace(/[/+=]/g, '').slice(0, 50)}`
      
      // Get or create merchant
      let merchantId: string | null = null
      try {
        merchantId = await findOrCreateMerchant(supabase, user.id, tx.description)
      } catch (error) {
        console.error('Error normalizing merchant:', error)
      }
      
      // Insert transaction
      const { error: insertError, data: insertedData } = await supabase
        .from('transactions')
        .upsert({
          user_id: user.id,
          account_id: csvAccountId,
          merchant_id: merchantId,
          plaid_transaction_id: txId,
          amount: tx.amount,
          date: tx.date,
          name: tx.description,
          merchant_name: tx.description,
          pending: false,
        }, {
          onConflict: 'user_id,plaid_transaction_id',
        })
        .select('id')
      
      if (insertError) {
        console.log('Insert error:', insertError.message, 'for tx:', tx.description.slice(0, 30))
        errors.push(insertError.message)
        skipped++
      } else {
        added++
      }
    }
    
    console.log('=== INSERT COMPLETE ===')
    console.log('Added:', added, 'Skipped:', skipped)
    if (errors.length > 0) {
      console.log('Sample errors:', errors.slice(0, 3))
    }
    
    // Run detection algorithms
    const recurringResult = await runRecurringDetection(supabase, user.id)
    const priceChangeResult = await runPriceChangeDetection(supabase, user.id)
    
    // Update last sync time
    await supabase
      .from('users')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', user.id)
    
    return NextResponse.json({
      success: true,
      transactions: {
        parsed: parseResult.transactions.length,
        added,
        skipped: skipped + parseResult.skipped,
      },
      recurring_detected: recurringResult.detected,
      price_changes_detected: priceChangeResult.detected,
      warnings: parseResult.errors.length > 0 ? parseResult.errors.slice(0, 3) : undefined,
    })
  } catch (error) {
    console.error('Error processing CSV:', error)
    return NextResponse.json(
      { error: 'Failed to process CSV file' },
      { status: 500 }
    )
  }
}
