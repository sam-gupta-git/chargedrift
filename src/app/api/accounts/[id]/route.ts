import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { id: accountId } = await params
    
    // Verify the account belongs to the user
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, account_name')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single()
    
    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }
    
    // Get merchant IDs from transactions we're about to delete
    const { data: affectedTx } = await supabase
      .from('transactions')
      .select('merchant_id')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
    
    const affectedMerchantIds = [...new Set(
      (affectedTx || [])
        .map(t => t.merchant_id)
        .filter(Boolean)
    )]
    
    // Delete all transactions for this account
    const { error: txDeleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('account_id', accountId)
      .eq('user_id', user.id)
    
    if (txDeleteError) {
      console.error('Error deleting transactions:', txDeleteError)
    }
    
    // Delete the account
    const { error: deleteError } = await supabase
      .from('accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', user.id)
    
    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
    }
    
    // Clean up orphaned data for affected merchants
    for (const merchantId of affectedMerchantIds) {
      // Check if merchant still has transactions
      const { count: remainingTx } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('merchant_id', merchantId)
        .eq('user_id', user.id)
      
      if (remainingTx === 0) {
        // Delete price changes for this merchant
        await supabase
          .from('price_changes')
          .delete()
          .eq('merchant_id', merchantId)
          .eq('user_id', user.id)
        
        // Delete recurring charges for this merchant
        await supabase
          .from('recurring_charges')
          .delete()
          .eq('merchant_id', merchantId)
          .eq('user_id', user.id)
        
        // Delete merchant aliases
        await supabase
          .from('merchant_aliases')
          .delete()
          .eq('merchant_id', merchantId)
          .eq('user_id', user.id)
        
        // Delete the merchant
        await supabase
          .from('merchants')
          .delete()
          .eq('id', merchantId)
          .eq('user_id', user.id)
      } else {
        // Merchant still has transactions from other accounts
        // Re-calculate recurring charges for this merchant
        // For now, just mark as needing recalculation by deactivating
        await supabase
          .from('recurring_charges')
          .update({ is_active: false })
          .eq('merchant_id', merchantId)
          .eq('user_id', user.id)
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      deleted_account: account.account_name,
      cleaned_merchants: affectedMerchantIds.length
    })
  } catch (error) {
    console.error('Error deleting account:', error)
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    )
  }
}
