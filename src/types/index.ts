// Database types matching Supabase schema

export interface User {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  plaid_cursor: string | null;
}

export interface Account {
  id: string;
  user_id: string;
  plaid_account_id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  institution_name: string | null;
  account_name: string | null;
  account_type: string | null;
  account_subtype: string | null;
  mask: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  sync_cursor: string | null;
}

export interface Merchant {
  id: string;
  user_id: string;
  name: string;
  raw_names: string[];
  category: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface MerchantAlias {
  id: string;
  merchant_id: string;
  raw_name: string;
  user_id: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  merchant_id: string | null;
  plaid_transaction_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name: string | null;
  pending: boolean;
  category: string[] | null;
  created_at: string;
  updated_at: string;
}

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringCharge {
  id: string;
  user_id: string;
  merchant_id: string;
  frequency: RecurringFrequency;
  confidence_score: number;
  first_seen_at: string;
  last_seen_at: string;
  first_amount: number;
  current_amount: number;
  transaction_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PriceChange {
  id: string;
  recurring_charge_id: string;
  user_id: string;
  merchant_id: string;
  previous_amount: number;
  new_amount: number;
  change_amount: number;
  change_percent: number;
  detected_at: string;
  transaction_id: string | null;
  created_at: string;
}

// View types
export interface PriceDriftSummary {
  recurring_charge_id: string;
  user_id: string;
  merchant_id: string;
  merchant_name: string;
  frequency: RecurringFrequency;
  first_amount: number;
  current_amount: number;
  first_seen_at: string;
  last_seen_at: string;
  transaction_count: number;
  total_change: number;
  percent_change: number;
  annualized_increase: number;
  is_active: boolean;
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface PlaidLinkTokenResponse {
  link_token: string;
  expiration: string;
}

export interface PlaidExchangeResponse {
  success: boolean;
  account_id: string;
}

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  recurring_detected: number;
  price_changes_detected: number;
}

// Merchant history for detail page
export interface MerchantPriceHistory {
  merchant: Merchant;
  recurring_charge: RecurringCharge | null;
  price_changes: PriceChange[];
  transactions: Transaction[];
  summary: {
    first_price: number;
    current_price: number;
    percent_change: number;
    annualized_increase: number;
    months_tracked: number;
  } | null;
}
