-- ============================================================
-- Close legacy "any signed-in user" policies (RLS audit, 2026-11-27)
--
-- The live database carried catch-all policies (auth.role() = 'authenticated'
-- or USING true) on almost every table. Policies are OR-ed, so these made the
-- owner/manager/assistant/sub-agent rules meaningless: any signed-in account
-- could read and change candidates, passports, invoices, payroll, loans,
-- audit logs and more.
--
-- This migration removes EVERY policy on the affected tables and recreates the
-- intended set, so the outcome does not depend on what happened to exist live.
-- It runs as one implicit transaction: if any statement fails, nothing changes.
--
-- Access model:
--   owner / manager : full access (finance, payroll, loans, vendors, etc.)
--   assistant       : read all candidates / passports / visas / sub-agents;
--                     create + edit + delete only records they created;
--                     read + add candidate documents
--   sub-agent       : read-only, own candidates / passports / visas / invoices /
--                     loans / repayments, and own sub_agents row
--   audit_logs      : staff read; append-only for signed-in staff roles
-- ============================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'audit_logs','candidate_documents','candidates','cheques','employee_payroll',
        'employees','expenses','invoice_items','invoices','loan_repayments','loans',
        'passports','payroll','refunds','sub_agent_payouts','sub_agents',
        'vendor_transactions','vendors','visa_applications'])
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── Owner + manager only ─────────────────────────────────────
CREATE POLICY "cheques: owner+manager all" ON public.cheques FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));

CREATE POLICY "employee_payroll: owner+manager all" ON public.employee_payroll FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));

CREATE POLICY "employees: owner+manager all" ON public.employees FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));

CREATE POLICY "expenses: owner+manager all" ON public.expenses FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));

CREATE POLICY "payroll: owner+manager all" ON public.payroll FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));

CREATE POLICY "refunds: owner+manager all" ON public.refunds FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));

CREATE POLICY "sub_agent_payouts: owner+manager all" ON public.sub_agent_payouts FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));

CREATE POLICY "vendor_transactions: owner+manager all" ON public.vendor_transactions FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));

CREATE POLICY "vendors: owner+manager all" ON public.vendors FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));

-- ── audit_logs: staff read; append-only (no update/delete from the browser)
CREATE POLICY "audit_logs: owner+manager read" ON public.audit_logs FOR SELECT
  USING (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "audit_logs: staff append" ON public.audit_logs FOR INSERT
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager','assistant','agent']));

-- ── sub_agents ───────────────────────────────────────────────
CREATE POLICY "sub_agents: owner+manager all" ON public.sub_agents FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "sub_agents: sub-agent read own row" ON public.sub_agents FOR SELECT
  USING (profile_id = auth.uid());
CREATE POLICY "sub_agents: assistant read" ON public.sub_agents FOR SELECT
  USING (is_assistant());

-- ── candidates ───────────────────────────────────────────────
CREATE POLICY "candidates: owner+manager all" ON public.candidates FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "candidates: sub-agent read assigned" ON public.candidates FOR SELECT
  USING (get_my_role() = 'agent'
         AND sub_agent_id = (SELECT id FROM public.sub_agents WHERE profile_id = auth.uid() LIMIT 1));
CREATE POLICY "candidates: assistant read all" ON public.candidates FOR SELECT
  USING (is_assistant());
CREATE POLICY "candidates: assistant insert own" ON public.candidates FOR INSERT
  WITH CHECK (is_assistant() AND created_by = auth.uid());
CREATE POLICY "candidates: assistant update own" ON public.candidates FOR UPDATE
  USING (is_assistant() AND created_by = auth.uid())
  WITH CHECK (is_assistant() AND created_by = auth.uid());
CREATE POLICY "candidates: assistant delete own" ON public.candidates FOR DELETE
  USING (is_assistant() AND created_by = auth.uid());

-- ── passports ────────────────────────────────────────────────
CREATE POLICY "passports: owner+manager all" ON public.passports FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "passports: sub-agent read assigned" ON public.passports FOR SELECT
  USING (get_my_role() = 'agent'
         AND candidate_id IN (SELECT id FROM public.candidates
                              WHERE sub_agent_id = (SELECT id FROM public.sub_agents WHERE profile_id = auth.uid() LIMIT 1)));
CREATE POLICY "passports: assistant read all" ON public.passports FOR SELECT
  USING (is_assistant());
CREATE POLICY "passports: assistant insert own" ON public.passports FOR INSERT
  WITH CHECK (is_assistant() AND created_by = auth.uid());
CREATE POLICY "passports: assistant update own" ON public.passports FOR UPDATE
  USING (is_assistant() AND created_by = auth.uid())
  WITH CHECK (is_assistant() AND created_by = auth.uid());
CREATE POLICY "passports: assistant delete own" ON public.passports FOR DELETE
  USING (is_assistant() AND created_by = auth.uid());

-- ── visa_applications ────────────────────────────────────────
CREATE POLICY "visa_applications: owner+manager all" ON public.visa_applications FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "visa_applications: sub-agent read assigned" ON public.visa_applications FOR SELECT
  USING (get_my_role() = 'agent'
         AND candidate_id IN (SELECT id FROM public.candidates
                              WHERE sub_agent_id = (SELECT id FROM public.sub_agents WHERE profile_id = auth.uid() LIMIT 1)));
CREATE POLICY "visa_applications: assistant read all" ON public.visa_applications FOR SELECT
  USING (is_assistant());
CREATE POLICY "visa_applications: assistant insert own" ON public.visa_applications FOR INSERT
  WITH CHECK (is_assistant() AND created_by = auth.uid());
CREATE POLICY "visa_applications: assistant update own" ON public.visa_applications FOR UPDATE
  USING (is_assistant() AND created_by = auth.uid())
  WITH CHECK (is_assistant() AND created_by = auth.uid());
CREATE POLICY "visa_applications: assistant delete own" ON public.visa_applications FOR DELETE
  USING (is_assistant() AND created_by = auth.uid());

-- ── candidate_documents ──────────────────────────────────────
CREATE POLICY "candidate_documents: owner+manager all" ON public.candidate_documents FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "candidate_documents: assistant read" ON public.candidate_documents FOR SELECT
  USING (is_assistant());
CREATE POLICY "candidate_documents: assistant insert" ON public.candidate_documents FOR INSERT
  WITH CHECK (is_assistant());

-- ── invoices / invoice_items ─────────────────────────────────
CREATE POLICY "invoices: owner+manager all" ON public.invoices FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "invoices: sub-agent read own" ON public.invoices FOR SELECT
  USING (get_my_role() = 'agent'
         AND sub_agent_id = (SELECT id FROM public.sub_agents WHERE profile_id = auth.uid() LIMIT 1));

CREATE POLICY "invoice_items: owner+manager all" ON public.invoice_items FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "invoice_items: sub-agent read own invoices" ON public.invoice_items FOR SELECT
  USING (get_my_role() = 'agent'
         AND invoice_id IN (SELECT id FROM public.invoices
                            WHERE sub_agent_id = (SELECT id FROM public.sub_agents WHERE profile_id = auth.uid() LIMIT 1)));

-- ── loans / loan_repayments ──────────────────────────────────
CREATE POLICY "loans: owner+manager all" ON public.loans FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "loans: sub-agent read own" ON public.loans FOR SELECT
  USING (get_my_role() = 'agent'
         AND sub_agent_id = (SELECT id FROM public.sub_agents WHERE profile_id = auth.uid() LIMIT 1));

CREATE POLICY "loan_repayments: owner+manager all" ON public.loan_repayments FOR ALL
  USING (get_my_role() = ANY (ARRAY['owner','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner','manager']));
CREATE POLICY "loan_repayments: sub-agent read own" ON public.loan_repayments FOR SELECT
  USING (get_my_role() = 'agent'
         AND loan_id IN (SELECT id FROM public.loans
                         WHERE sub_agent_id = (SELECT id FROM public.sub_agents WHERE profile_id = auth.uid() LIMIT 1)));
