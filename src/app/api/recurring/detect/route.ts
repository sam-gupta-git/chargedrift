import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runRecurringDetection } from '@/lib/services/recurring-detector'
import { runPriceChangeDetection } from '@/lib/services/price-drift'

export async function POST() {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Run recurring detection
    const recurringResult = await runRecurringDetection(supabase, user.id)
    
    // Run price change detection
    const priceChangeResult = await runPriceChangeDetection(supabase, user.id)
    
    return NextResponse.json({
      success: true,
      recurring: {
        detected: recurringResult.detected,
        saved: recurringResult.saved,
      },
      price_changes: {
        detected: priceChangeResult.detected,
        saved: priceChangeResult.saved,
      },
    })
  } catch (error) {
    console.error('Error detecting recurring charges:', error)
    return NextResponse.json(
      { error: 'Failed to detect recurring charges' },
      { status: 500 }
    )
  }
}
