-- ============================================================
-- Fix: invoice payment race condition
--
-- Previously, invoice status ("unpaid" / "partial" / "paid") was
-- computed entirely in the browser: read the current payments total
-- from state, add the new payment, decide the new status, write it.
-- If two staff recorded a payment on the same invoice within a few
-- seconds of each other, both could read the same stale total, both
-- pass the client-side "don't overpay" check, and both write a
-- status computed from that stale total — an invoice could end up
-- overpaid, or stuck showing "partial" after actually being paid in
-- full.
--
-- Fix: move both the overpayment guard and the status calculation
-- into a trigger that runs inside the same transaction as the
-- payment insert, after taking a row lock on the invoice. Postgres
-- serializes concurrent transactions that try to lock the same row,
-- so the second of two simultaneous payments always sees the first
-- one's committed total — there is no window for both to succeed
-- against the same stale "remaining".
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalc_invoice_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_total  numeric;
  paid_total numeric;
BEGIN
  -- Lock the invoice row so a concurrent payment insert on the same
  -- invoice has to wait for this transaction to finish first.
  SELECT total INTO inv_total
    FROM public.invoices
    WHERE id = NEW.invoice_id
    FOR UPDATE;

  IF inv_total IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', NEW.invoice_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO paid_total
    FROM public.payments
    WHERE invoice_id = NEW.invoice_id;

  IF paid_total > inv_total + 0.01 THEN
    RAISE EXCEPTION 'Payment of % would exceed invoice total of % (already paid %)',
      NEW.amount, inv_total, paid_total - NEW.amount;
  END IF;

  UPDATE public.invoices
    SET status = CASE
      WHEN paid_total >= inv_total - 0.01 THEN 'paid'
      WHEN paid_total <= 0.01 THEN 'unpaid'
      ELSE 'partial'
    END
    WHERE id = NEW.invoice_id
      AND status <> 'cancelled'; -- never resurrect a cancelled invoice

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_invoice_status ON public.payments;

CREATE TRIGGER trg_recalc_invoice_status
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.recalc_invoice_status();
