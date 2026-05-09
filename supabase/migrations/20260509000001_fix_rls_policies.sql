-- ============================================================
-- Fix: Enable RLS and add policies for UNRESTRICTED tables
-- Tables affected: loans, profiles, vendor_balances (view),
--                  notifications, agent_payouts, money_receipts,
--                  payments
--
-- Strategy:
--   owner/manager  → full access to all rows
--   agent          → restricted to their own data
--   all auth users → can read their own notifications / profile
-- ============================================================

-- ── Helper: role-check functions ────────────────────────────
-- Avoids repeating the subquery in every policy.

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- ── profiles ────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can always read and update their own profile row.
CREATE POLICY "profiles: own read"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles: own update"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Owner / manager can read ALL profiles (e.g. staff list, audit log display).
CREATE POLICY "profiles: owner+manager read all"
  ON public.profiles FOR SELECT
  USING (auth.user_role() IN ('owner', 'manager'));

-- Only the service role (used by API/edge functions) may insert profiles.
-- New profile rows are created by the handle_new_user trigger, not by clients.
CREATE POLICY "profiles: service role insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ── loans ────────────────────────────────────────────────────
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- Owner / manager: full CRUD on all loans.
CREATE POLICY "loans: owner+manager all"
  ON public.loans FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

-- Agent: can only view loans issued to them.
CREATE POLICY "loans: agent read own"
  ON public.loans FOR SELECT
  USING (
    auth.user_role() = 'agent'
    AND agent_id = (SELECT id FROM public.agents WHERE user_id = auth.uid() LIMIT 1)
  );

-- ── loan_repayments ──────────────────────────────────────────
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_repayments: owner+manager all"
  ON public.loan_repayments FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

CREATE POLICY "loan_repayments: agent read own"
  ON public.loan_repayments FOR SELECT
  USING (
    auth.user_role() = 'agent'
    AND loan_id IN (
      SELECT id FROM public.loans
      WHERE agent_id = (SELECT id FROM public.agents WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- ── notifications ────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Each user sees only their own notifications.
CREATE POLICY "notifications: own all"
  ON public.notifications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role may insert notifications for any user (triggered by API routes).
CREATE POLICY "notifications: service role insert"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ── vendor_balances (view) ───────────────────────────────────
-- Views inherit the RLS of their underlying tables (vendors +
-- vendor_transactions). Enable RLS on those tables; the view
-- will automatically respect them.

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendors: owner+manager all"
  ON public.vendors FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

ALTER TABLE public.vendor_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_transactions: owner+manager all"
  ON public.vendor_transactions FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

-- ── agent_payouts ────────────────────────────────────────────
ALTER TABLE public.agent_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_payouts: owner+manager all"
  ON public.agent_payouts FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

CREATE POLICY "agent_payouts: agent read own"
  ON public.agent_payouts FOR SELECT
  USING (
    auth.user_role() = 'agent'
    AND agent_id = (SELECT id FROM public.agents WHERE user_id = auth.uid() LIMIT 1)
  );

-- ── money_receipts ───────────────────────────────────────────
ALTER TABLE public.money_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "money_receipts: owner+manager all"
  ON public.money_receipts FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

-- ── payments ─────────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments: owner+manager all"
  ON public.payments FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

-- ── agents ───────────────────────────────────────────────────
-- (Ensure agents table is also protected — agents should see their own row)
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents: owner+manager all"
  ON public.agents FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

CREATE POLICY "agents: agent read own row"
  ON public.agents FOR SELECT
  USING (user_id = auth.uid());

-- ── candidates ───────────────────────────────────────────────
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidates: owner+manager all"
  ON public.candidates FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

CREATE POLICY "candidates: agent read assigned"
  ON public.candidates FOR SELECT
  USING (
    auth.user_role() = 'agent'
    AND agent_id = (SELECT id FROM public.agents WHERE user_id = auth.uid() LIMIT 1)
  );

-- ── passports ────────────────────────────────────────────────
ALTER TABLE public.passports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passports: owner+manager all"
  ON public.passports FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

CREATE POLICY "passports: agent read assigned"
  ON public.passports FOR SELECT
  USING (
    auth.user_role() = 'agent'
    AND candidate_id IN (
      SELECT id FROM public.candidates
      WHERE agent_id = (SELECT id FROM public.agents WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- ── visa_applications ────────────────────────────────────────
ALTER TABLE public.visa_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visa_applications: owner+manager all"
  ON public.visa_applications FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

CREATE POLICY "visa_applications: agent read assigned"
  ON public.visa_applications FOR SELECT
  USING (
    auth.user_role() = 'agent'
    AND candidate_id IN (
      SELECT id FROM public.candidates
      WHERE agent_id = (SELECT id FROM public.agents WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- ── invoices / invoice_items ──────────────────────────────────
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices: owner+manager all"
  ON public.invoices FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

CREATE POLICY "invoices: agent read own"
  ON public.invoices FOR SELECT
  USING (
    auth.user_role() = 'agent'
    AND agent_id = (SELECT id FROM public.agents WHERE user_id = auth.uid() LIMIT 1)
  );

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_items: owner+manager all"
  ON public.invoice_items FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

CREATE POLICY "invoice_items: agent read own invoices"
  ON public.invoice_items FOR SELECT
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE agent_id = (SELECT id FROM public.agents WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- ── expenses ─────────────────────────────────────────────────
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses: owner+manager all"
  ON public.expenses FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

-- ── cheques ──────────────────────────────────────────────────
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cheques: owner+manager all"
  ON public.cheques FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

-- ── payroll / employee_payroll ────────────────────────────────
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll: owner+manager all"
  ON public.payroll FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

ALTER TABLE public.employee_payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_payroll: owner+manager all"
  ON public.employee_payroll FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

-- ── employees ────────────────────────────────────────────────
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees: owner+manager all"
  ON public.employees FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

-- ── refunds ──────────────────────────────────────────────────
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refunds: owner+manager all"
  ON public.refunds FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

-- ── audit_logs / passport_workflow_logs ──────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs: owner+manager read"
  ON public.audit_logs FOR SELECT
  USING (auth.user_role() IN ('owner', 'manager'));

CREATE POLICY "audit_logs: service role insert"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.passport_workflow_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passport_workflow_logs: owner+manager all"
  ON public.passport_workflow_logs FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));

-- ── candidate_documents ──────────────────────────────────────
ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidate_documents: owner+manager all"
  ON public.candidate_documents FOR ALL
  USING (auth.user_role() IN ('owner', 'manager'))
  WITH CHECK (auth.user_role() IN ('owner', 'manager'));
