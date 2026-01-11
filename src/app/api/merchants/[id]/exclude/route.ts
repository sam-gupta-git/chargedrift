import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
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
    const { excluded } = await request.json()
    
    // Update merchant exclusion status
    const { error: updateError } = await supabase
      .from('merchants')
      .update({ is_excluded: excluded })
      .eq('id', merchantId)
      .eq('user_id', user.id)
    
    if (updateError) {
      return NextResponse.json({ error: 'Failed to update merchant' }, { status: 500 })
    }
    
    // Also deactivate recurring charges for this merchant if excluding
    if (excluded) {
      await supabase
        .from('recurring_charges')
        .update({ is_active: false })
        .eq('merchant_id', merchantId)
        .eq('user_id', user.id)
    }
    
    return NextResponse.json({ success: true, excluded })
  } catch (error) {
    console.error('Error excluding merchant:', error)
    return NextResponse.json(
      { error: 'Failed to exclude merchant' },
      { status: 500 }
    )
  }
}
