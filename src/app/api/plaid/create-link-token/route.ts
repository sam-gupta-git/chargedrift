import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { plaidClient } from '@/lib/plaid/client'
import { Products, CountryCode } from 'plaid'

export async function POST() {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const request = {
      user: {
        client_user_id: user.id,
      },
      client_name: 'ChargeDrift',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    }
    
    const response = await plaidClient.linkTokenCreate(request)
    
    return NextResponse.json({
      link_token: response.data.link_token,
      expiration: response.data.expiration,
    })
  } catch (error) {
    console.error('Error creating link token:', error)
    return NextResponse.json(
      { error: 'Failed to create link token' },
      { status: 500 }
    )
  }
}
