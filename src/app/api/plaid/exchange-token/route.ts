import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { plaidClient } from '@/lib/plaid/client'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { public_token, metadata } = await request.json()
    
    if (!public_token) {
      return NextResponse.json({ error: 'Missing public_token' }, { status: 400 })
    }
    
    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    })
    
    const accessToken = exchangeResponse.data.access_token
    const itemId = exchangeResponse.data.item_id
    
    // Get account info
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    })
    
    // Get institution name
    let institutionName = 'Unknown Bank'
    if (metadata?.institution?.name) {
      institutionName = metadata.institution.name
    }
    
    // Store accounts in database
    const accounts = accountsResponse.data.accounts.map(account => ({
      user_id: user.id,
      plaid_account_id: account.account_id,
      plaid_item_id: itemId,
      plaid_access_token: accessToken,
      institution_name: institutionName,
      account_name: account.name,
      account_type: account.type,
      account_subtype: account.subtype || null,
      mask: account.mask,
      is_active: true,
    }))
    
    const { error: insertError } = await supabase
      .from('accounts')
      .upsert(accounts, {
        onConflict: 'user_id,plaid_account_id',
      })
    
    if (insertError) {
      console.error('Error inserting accounts:', insertError)
      return NextResponse.json(
        { error: 'Failed to save account information' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      accounts_linked: accounts.length,
    })
  } catch (error) {
    console.error('Error exchanging token:', error)
    return NextResponse.json(
      { error: 'Failed to exchange token' },
      { status: 500 }
    )
  }
}
