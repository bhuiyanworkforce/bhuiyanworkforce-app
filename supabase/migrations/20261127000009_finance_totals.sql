-- Part 2 of 2: totals functions used by Dashboard and Reports.
-- Run AFTER part 1.

-- ── 10. Totals the app reads (no 1000-row limit, runs under the caller's RLS) ──
-- Revenue = money actually received (payments), not just fully paid invoices.
-- Refunds are deducted from revenue; they are not counted as expenses.
-- The day a payment was received. Reads whichever date column your payments
-- table has, so this does not depend on its exact name.
CREATE OR REPLACE FUNCTION public.payment_day(p public.payments)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(to_jsonb(p) ->> 'payment_date', ''),
    NULLIF(to_jsonb(p) ->> 'paid_at', ''),
    NULLIF(to_jsonb(p) ->> 'received_at', ''),
    NULLIF(to_jsonb(p) ->> 'paid_date', ''),
    NULLIF(to_jsonb(p) ->> 'date', ''),
    NULLIF(to_jsonb(p) ->> 'created_at', ''),
    NULLIF(to_jsonb(p) ->> 'inserted_at', ''),
    CURRENT_DATE::text
  )::timestamptz::date;
$$;

CREATE OR REPLACE FUNCTION public.finance_summary(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (revenue numeric, refunds numeric, expenses numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(pm.amount) FROM public.payments pm
              WHERE (p_from IS NULL OR public.payment_day(pm) >= p_from) AND (p_to IS NULL OR public.payment_day(pm) <= p_to)), 0),
    COALESCE((SELECT SUM(amount) FROM public.refunds
              WHERE status = 'paid'
                AND (p_from IS NULL OR COALESCE(paid_at::date, refund_date) >= p_from)
                AND (p_to   IS NULL OR COALESCE(paid_at::date, refund_date) <= p_to)), 0),
    COALESCE((SELECT SUM(amount) FROM public.expenses
              WHERE (p_from IS NULL OR date >= p_from) AND (p_to IS NULL OR date <= p_to)), 0);
$$;

CREATE OR REPLACE FUNCTION public.finance_monthly(p_from date, p_to date)
RETURNS TABLE (month date, revenue numeric, refunds numeric, expenses numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH r AS (
    SELECT date_trunc('month', public.payment_day(pm))::date AS m, SUM(pm.amount) AS v
    FROM public.payments pm WHERE public.payment_day(pm) BETWEEN p_from AND p_to GROUP BY 1
  ), f AS (
    SELECT date_trunc('month', COALESCE(paid_at::date, refund_date))::date AS m, SUM(amount) AS v
    FROM public.refunds WHERE status = 'paid' AND COALESCE(paid_at::date, refund_date) BETWEEN p_from AND p_to GROUP BY 1
  ), e AS (
    SELECT date_trunc('month', date)::date AS m, SUM(amount) AS v
    FROM public.expenses WHERE date BETWEEN p_from AND p_to GROUP BY 1
  )
  SELECT m, COALESCE(r.v, 0), COALESCE(f.v, 0), COALESCE(e.v, 0)
  FROM (SELECT m FROM r UNION SELECT m FROM f UNION SELECT m FROM e) months(m)
  LEFT JOIN r USING (m) LEFT JOIN f USING (m) LEFT JOIN e USING (m)
  ORDER BY m;
$$;

REVOKE EXECUTE ON FUNCTION public.payment_day(public.payments) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.payment_day(public.payments) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_summary(date, date)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finance_monthly(date, date)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.finance_summary(date, date)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.finance_monthly(date, date)  TO authenticated;
