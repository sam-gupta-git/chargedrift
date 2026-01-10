import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatFrequency(frequency: string): string {
  const labels: Record<string, string> = {
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
  }
  return labels[frequency] || frequency
}

export function getChangeColor(change: number): string {
  if (change > 0) return 'text-red-500'
  if (change < 0) return 'text-green-500'
  return 'text-muted-foreground'
}

export function getChangeBgColor(change: number): string {
  if (change > 0) return 'bg-red-500/10'
  if (change < 0) return 'bg-green-500/10'
  return 'bg-muted'
}
