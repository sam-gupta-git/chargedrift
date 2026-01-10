'use client'

import Link from 'next/link'
import { PriceDriftSummary } from '@/types'
import { formatCurrency, formatPercent, formatFrequency, getChangeColor, getChangeBgColor } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react'

interface PriceDriftTableProps {
  items: PriceDriftSummary[]
}

export function PriceDriftTable({ items }: PriceDriftTableProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No price changes detected yet.</p>
        <p className="text-sm mt-2">Connect your bank and sync transactions to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <Link
          key={item.recurring_charge_id}
          href={`/merchant/${item.merchant_id}`}
          className={`block p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-all opacity-0 animate-fade-in hover:border-primary/50`}
          style={{ animationDelay: `${index * 0.05}s` }}
        >
          <div className="flex items-center justify-between gap-4">
            {/* Merchant info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold truncate">{item.merchant_name}</h3>
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                  {formatFrequency(item.frequency)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {item.transaction_count} transactions tracked
              </p>
            </div>

            {/* Price change */}
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-sm text-muted-foreground">
                    {formatCurrency(item.first_amount)}
                  </span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono font-semibold">
                    {formatCurrency(item.current_amount)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  First → Current
                </p>
              </div>

              {/* Change indicator */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${getChangeBgColor(item.percent_change)}`}>
                {item.percent_change > 0 ? (
                  <TrendingUp className="w-4 h-4 text-red-500" />
                ) : item.percent_change < 0 ? (
                  <TrendingDown className="w-4 h-4 text-green-500" />
                ) : (
                  <Minus className="w-4 h-4 text-muted-foreground" />
                )}
                <span className={`font-mono font-bold ${getChangeColor(item.percent_change)}`}>
                  {formatPercent(item.percent_change)}
                </span>
              </div>

              {/* Annualized */}
              <div className="text-right min-w-[100px]">
                <p className={`font-mono text-sm ${getChangeColor(item.annualized_increase)}`}>
                  {formatPercent(item.annualized_increase)}/yr
                </p>
                <p className="text-xs text-muted-foreground">annualized</p>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
