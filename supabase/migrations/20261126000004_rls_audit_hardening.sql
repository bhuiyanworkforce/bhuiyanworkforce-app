-- ============================================================
-- RLS audit hardening (follow-up to the 2026-11-26 review)
--
-- 1. Financial and audit records become append-only for client sessions.
--    payments / money_receipts / passport_workflow_logs had owner+manager
--    FOR ALL policies, so any manager could UPDATE or DELETE a payment from the
--    browser. The overpayment/status trigger (recalc_invoice_status) only fires
--    on INSERT, so an edited or deleted payment left the invoice status wrong,
--    and a deleted workflow log erased the audit trail. The app itself never
--    updates or deletes these rows, so nothing in the UI changes.
--    Corrections are still possible via the SQL editor or the service role
--    (both bypass RLS).
--
-- 2. get_candidate_stage_counts() is SECURITY DEFINER with no auth check and,
--    like every function, was executable by PUBLIC, so the anon key could call
--    it through /rpc. Restrict to signed-in users.
--
-- 3. Pin search_path on the auth.* helper functions that the earlier
--    hardening migration did not cover. Wrapped so the migration does not fail
--    if the SQL editor role may not alter objects in the auth schema.
-- ============================================================

-- ── 1. Append-only financial / audit tables ──────────────────

-- payments
DROP POLICY IF EXISTS "payments: owner+manager all" ON public.payments;
DROP POLICY IF EXISTS "payments: owner+manager read" ON public.payments;
DROP POLICY IF EXISTS "payments: owner+manager insert" ON public.payments;
CREATE POLICY "payments: owner+manager read"
  ON public.payments FOR SELECT
  USING (auth.is_staff());
CREATE POLICY "payments: owner+manager insert"
  ON public.payments FOR INSERT
  WITH CHECK (auth.is_staff());

-- money_receipts (rows are created by the create_receipt_on_payment trigger)
DROP POLICY IF EXISTS "money_receipts: owner+manager all" ON public.money_receipts;
DROP POLICY IF EXISTS "money_receipts: owner+manager read" ON public.money_receipts;
CREATE POLICY "money_receipts: owner+manager read"
  ON public.money_receipts FOR SELECT
  USING (auth.is_staff());

-- passport_workflow_logs
DROP POLICY IF EXISTS "passport_workflow_logs: owner+manager all" ON public.passport_workflow_logs;
DROP POLICY IF EXISTS "passport_workflow_logs: owner+manager read" ON public.passport_workflow_logs;
DROP POLICY IF EXISTS "passport_workflow_logs: owner+manager insert" ON public.passport_workflow_logs;
CREATE POLICY "passport_workflow_logs: owner+manager read"
  ON public.passport_workflow_logs FOR SELECT
  USING (auth.is_staff());
CREATE POLICY "passport_workflow_logs: owner+manager insert"
  ON public.passport_workflow_logs FOR INSERT
  WITH CHECK (auth.is_staff());
-- ("passport_workflow_logs: assistant read" from 20260511000002 stays as is.)

-- ── 2. Stage-count RPC: signed-in users only ─────────────────
REVOKE EXECUTE ON FUNCTION public.get_candidate_stage_counts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_candidate_stage_counts() TO authenticated;

-- ── 3. Pin search_path on auth.* helpers ─────────────────────
DO $$
BEGIN
  ALTER FUNCTION auth.user_role()       SET search_path = public;
  ALTER FUNCTION auth.is_staff()        SET search_path = public;
  ALTER FUNCTION auth.is_service_role() SET search_path = public;
EXCEPTION
  WHEN insufficient_privilege OR undefined_function THEN
    RAISE NOTICE 'Could not pin search_path on auth.* helpers (%). Run this part as the postgres role.', SQLERRM;
END
$$;
