-- Recurring Charge Drift Detector Database Schema
-- This migration creates all necessary tables for tracking transactions,
-- detecting recurring charges, and identifying price drift.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- Extends Supabase auth.users with app-specific data
-- ============================================================================
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_sync_at TIMESTAMPTZ,
    plaid_cursor TEXT -- For incremental transaction sync
);

-- ============================================================================
-- ACCOUNTS TABLE
-- Stores Plaid-connected bank accounts
-- ============================================================================
CREATE TABLE public.accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plaid_account_id TEXT NOT NULL,
    plaid_item_id TEXT NOT NULL,
    plaid_access_token TEXT NOT NULL, -- Encrypted in production
    institution_name TEXT,
    account_name TEXT,
    account_type TEXT,
    account_subtype TEXT,
    mask TEXT, -- Last 4 digits
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_sync_at TIMESTAMPTZ,
    sync_cursor TEXT, -- Per-account cursor for transaction sync
    UNIQUE(user_id, plaid_account_id)
);

CREATE INDEX idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX idx_accounts_plaid_item_id ON public.accounts(plaid_item_id);

-- ============================================================================
-- MERCHANTS TABLE
-- Normalized merchant names for grouping similar transactions
-- ============================================================================
CREATE TABLE public.merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- Normalized/clean merchant name
    raw_names TEXT[] DEFAULT '{}', -- Array of original merchant strings
    category TEXT, -- Optional category from Plaid
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, name)
);

CREATE INDEX idx_merchants_user_id ON public.merchants(user_id);
CREATE INDEX idx_merchants_name ON public.merchants(name);

-- ============================================================================
-- MERCHANT_ALIASES TABLE
-- Maps raw merchant strings to normalized merchants
-- ============================================================================
CREATE TABLE public.merchant_aliases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    raw_name TEXT NOT NULL, -- Original merchant name from transaction
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, raw_name)
);

CREATE INDEX idx_merchant_aliases_merchant_id ON public.merchant_aliases(merchant_id);
CREATE INDEX idx_merchant_aliases_raw_name ON public.merchant_aliases(raw_name);

-- ============================================================================
-- TRANSACTIONS TABLE
-- Stores all transactions from Plaid
-- ============================================================================
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL,
    plaid_transaction_id TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL, -- Positive = debit, Negative = credit
    date DATE NOT NULL,
    name TEXT NOT NULL, -- Raw merchant name from Plaid
    merchant_name TEXT, -- Cleaned merchant name from Plaid
    pending BOOLEAN DEFAULT FALSE,
    category TEXT[], -- Plaid categories
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, plaid_transaction_id)
);

CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_account_id ON public.transactions(account_id);
CREATE INDEX idx_transactions_merchant_id ON public.transactions(merchant_id);
CREATE INDEX idx_transactions_date ON public.transactions(date DESC);
CREATE INDEX idx_transactions_amount ON public.transactions(amount);

-- ============================================================================
-- RECURRING_CHARGES TABLE
-- Detected recurring charges (subscriptions, memberships, etc.)
-- ============================================================================
CREATE TABLE public.recurring_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
    confidence_score DECIMAL(3, 2) DEFAULT 0.00, -- 0.00 to 1.00
    first_seen_at DATE NOT NULL,
    last_seen_at DATE NOT NULL,
    first_amount DECIMAL(12, 2) NOT NULL,
    current_amount DECIMAL(12, 2) NOT NULL,
    transaction_count INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, merchant_id, frequency)
);

CREATE INDEX idx_recurring_charges_user_id ON public.recurring_charges(user_id);
CREATE INDEX idx_recurring_charges_merchant_id ON public.recurring_charges(merchant_id);
CREATE INDEX idx_recurring_charges_is_active ON public.recurring_charges(is_active);

-- ============================================================================
-- PRICE_CHANGES TABLE
-- Tracks individual price changes for recurring charges
-- ============================================================================
CREATE TABLE public.price_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recurring_charge_id UUID NOT NULL REFERENCES public.recurring_charges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    previous_amount DECIMAL(12, 2) NOT NULL,
    new_amount DECIMAL(12, 2) NOT NULL,
    change_amount DECIMAL(12, 2) NOT NULL, -- new_amount - previous_amount
    change_percent DECIMAL(8, 4) NOT NULL, -- ((new - prev) / prev) * 100
    detected_at DATE NOT NULL,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_price_changes_recurring_charge_id ON public.price_changes(recurring_charge_id);
CREATE INDEX idx_price_changes_user_id ON public.price_changes(user_id);
CREATE INDEX idx_price_changes_merchant_id ON public.price_changes(merchant_id);
CREATE INDEX idx_price_changes_detected_at ON public.price_changes(detected_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_changes ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own data" ON public.users
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON public.users
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own data" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Accounts policies
CREATE POLICY "Users can view own accounts" ON public.accounts
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON public.accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON public.accounts
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON public.accounts
    FOR DELETE USING (auth.uid() = user_id);

-- Merchants policies
CREATE POLICY "Users can view own merchants" ON public.merchants
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own merchants" ON public.merchants
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own merchants" ON public.merchants
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own merchants" ON public.merchants
    FOR DELETE USING (auth.uid() = user_id);

-- Merchant aliases policies
CREATE POLICY "Users can view own aliases" ON public.merchant_aliases
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own aliases" ON public.merchant_aliases
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own aliases" ON public.merchant_aliases
    FOR DELETE USING (auth.uid() = user_id);

-- Transactions policies
CREATE POLICY "Users can view own transactions" ON public.transactions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON public.transactions
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON public.transactions
    FOR DELETE USING (auth.uid() = user_id);

-- Recurring charges policies
CREATE POLICY "Users can view own recurring charges" ON public.recurring_charges
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recurring charges" ON public.recurring_charges
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recurring charges" ON public.recurring_charges
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recurring charges" ON public.recurring_charges
    FOR DELETE USING (auth.uid() = user_id);

-- Price changes policies
CREATE POLICY "Users can view own price changes" ON public.price_changes
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own price changes" ON public.price_changes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_merchants_updated_at
    BEFORE UPDATE ON public.merchants
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recurring_charges_updated_at
    BEFORE UPDATE ON public.recurring_charges
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View for price drift summary (top increases)
CREATE OR REPLACE VIEW public.price_drift_summary AS
SELECT 
    rc.id AS recurring_charge_id,
    rc.user_id,
    m.id AS merchant_id,
    m.name AS merchant_name,
    rc.frequency,
    rc.first_amount,
    rc.current_amount,
    rc.first_seen_at,
    rc.last_seen_at,
    rc.transaction_count,
    (rc.current_amount - rc.first_amount) AS total_change,
    CASE 
        WHEN rc.first_amount > 0 THEN 
            ROUND(((rc.current_amount - rc.first_amount) / rc.first_amount * 100)::numeric, 2)
        ELSE 0
    END AS percent_change,
    -- Annualized increase calculation
    CASE 
        WHEN rc.first_amount > 0 AND rc.first_seen_at < rc.last_seen_at THEN
            ROUND((
                (POWER(
                    (rc.current_amount / rc.first_amount),
                    (365.0 / GREATEST(1, (rc.last_seen_at - rc.first_seen_at)))
                ) - 1) * 100
            )::numeric, 2)
        ELSE 0
    END AS annualized_increase,
    rc.is_active
FROM public.recurring_charges rc
JOIN public.merchants m ON rc.merchant_id = m.id
WHERE rc.current_amount != rc.first_amount;
