-- ============================================================
-- RLS audit hardening (follow-up to the 2026-11-26 review)
--
-- Written against the LIVE database, where the role helper is get_my_role()
-- (not auth.is_staff(), which does not exist there).
--
-- 1. LEGACY OPEN POLICIES. The live database still carries old permissive
--    policies that the repo migrations never mention. RLS policies are OR-ed,
--    so these silently override the owner+manager rules:
--      payments                "Authenticated users manage payments"
--                              -> ALL for ANY signed-in user (assistant,
--                                 sub-agent, 'client' included)
--      money_receipts          "auth users"  -> ALL, USING true / CHECK true
--      passport_workflow_logs  "Authenticated users manage logs"
--                              -> ALL for any signed-in user
--                              "workflow_logs_access" -> ALL incl. sub-agents
--    They are dropped here.
--
-- 2. Financial and audit records become append-only for client sessions.
--    The app never updates or deletes payments, receipts or workflow logs, and
--    the overpayment/status trigger only fires on INSERT. Corrections remain
--    possible via the SQL editor or the service role (both bypass RLS).
--
-- 3. Assistants keep the ability to cancel a passport (the UI writes a
--    workflow log first), limited to logs attributed to themselves.
--
-- 4. get_candidate_stage_counts() was executable with the anon key.
-- ============================================================

-- ── payments ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users manage payments" ON public.payments;
DROP POLICY IF EXISTS "payments_access"                     ON public.payments;
DROP POLICY IF EXISTS "payments: owner+manager all"         ON public.payments;
DROP POLICY IF EXISTS "payments: owner+manager read"        ON public.payments;
DROP POLICY IF EXISTS "payments: owner+manager insert"      ON public.payments;

CREATE POLICY "payments: owner+manager read"
  ON public.payments FOR SELECT
  USING (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "payments: owner+manager insert"
  ON public.payments FOR INSERT
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));

-- ── money_receipts (rows are created by the create_receipt_on_payment trigger)
DROP POLICY IF EXISTS "auth users"                          ON public.money_receipts;
DROP POLICY IF EXISTS "money_receipts: owner+manager all"   ON public.money_receipts;
DROP POLICY IF EXISTS "money_receipts: owner+manager read"  ON public.money_receipts;

CREATE POLICY "money_receipts: owner+manager read"
  ON public.money_receipts FOR SELECT
  USING (get_my_role() = ANY (ARRAY['owner','manager']));

-- ── passport_workflow_logs ───────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users manage logs"              ON public.passport_workflow_logs;
DROP POLICY IF EXISTS "workflow_logs_access"                         ON public.passport_workflow_logs;
DROP POLICY IF EXISTS "passport_workflow_logs: owner+manager all"    ON public.passport_workflow_logs;
DROP POLICY IF EXISTS "passport_workflow_logs: owner+manager read"   ON public.passport_workflow_logs;
DROP POLICY IF EXISTS "passport_workflow_logs: owner+manager insert" ON public.passport_workflow_logs;
DROP POLICY IF EXISTS "passport_workflow_logs: assistant insert own" ON public.passport_workflow_logs;

CREATE POLICY "passport_workflow_logs: owner+manager read"
  ON public.passport_workflow_logs FOR SELECT
  USING (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "passport_workflow_logs: owner+manager insert"
  ON public.passport_workflow_logs FOR INSERT
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "passport_workflow_logs: assistant insert own"
  ON public.passport_workflow_logs FOR INSERT
  WITH CHECK (is_assistant() AND changed_by = auth.uid());
-- ("passport_workflow_logs: assistant read" already exists and stays.)

-- ── get_candidate_stage_counts: signed-in users only ─────────
REVOKE EXECUTE ON FUNCTION public.get_candidate_stage_counts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_candidate_stage_counts() TO authenticated;
