import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArrowRight, TrendingUp, Search, DollarSign } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (user) {
    redirect('/dashboard')
  }
  
  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-24">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-mono">
            <TrendingUp className="w-4 h-4" />
            <span>Price Increase Detector</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight opacity-0 animate-fade-in">
            <span className="text-foreground">Charge</span>
            <span className="text-primary">Drift</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto opacity-0 animate-fade-in stagger-1">
            Which merchants are charging you more than they used to?
          </p>
          
          <p className="text-muted-foreground opacity-0 animate-fade-in stagger-2">
            Connect your bank, detect recurring charges, and track price increases over time.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4 opacity-0 animate-fade-in stagger-3">
            <Link 
              href="/auth" 
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-lg bg-primary text-primary-foreground font-semibold text-lg hover:bg-primary/90 transition-all hover:gap-3"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
      
      {/* Features */}
      <div className="border-t border-border bg-card/50 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl bg-background/50 border border-border space-y-4 opacity-0 animate-fade-in stagger-1">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Search className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Detect Recurring Charges</h3>
              <p className="text-muted-foreground text-sm">
                Automatically identify subscriptions, memberships, and recurring payments from your transaction history.
              </p>
            </div>
            
            <div className="p-6 rounded-xl bg-background/50 border border-border space-y-4 opacity-0 animate-fade-in stagger-2">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Track Price Drift</h3>
              <p className="text-muted-foreground text-sm">
                See which merchants have increased their prices over time and by how much.
              </p>
            </div>
            
            <div className="p-6 rounded-xl bg-background/50 border border-border space-y-4 opacity-0 animate-fade-in stagger-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Annualized Increases</h3>
              <p className="text-muted-foreground text-sm">
                Calculate the annualized rate of price increases to understand the true impact on your wallet.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">Charge</span>
            <span className="font-bold text-primary">Drift</span>
          </div>
          <p>Your data stays private. We only read transactions.</p>
        </div>
      </footer>
    </main>
  )
}
