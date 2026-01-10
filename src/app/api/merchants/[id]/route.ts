import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMerchantPriceHistory } from '@/lib/services/price-drift'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { id: merchantId } = await params
    
    const history = await getMerchantPriceHistory(supabase, user.id, merchantId)
    
    return NextResponse.json(history)
  } catch (error) {
    console.error('Error fetching merchant history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch merchant history' },
      { status: 500 }
    )
  }
}
