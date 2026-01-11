-- Add excluded flag to merchants table
ALTER TABLE public.merchants 
ADD COLUMN IF NOT EXISTS is_excluded BOOLEAN DEFAULT FALSE;

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_merchants_is_excluded ON public.merchants(is_excluded);

-- Update the price drift summary view to exclude hidden merchants
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
WHERE rc.current_amount != rc.first_amount
  AND (m.is_excluded IS NULL OR m.is_excluded = FALSE);
