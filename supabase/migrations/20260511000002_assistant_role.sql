-- ============================================================
-- Add 'assistant' role support
--
-- Assistants can:
--   - Read and write candidates, passports, visa_applications
--   - Read passport_workflow_logs (to see history)
--   - Read their own notifications
--   - Read agents list (needed to assign candidates)
--
-- Assistants cannot access:
--   - invoices, expenses, cheques, loans, payroll,
--     refunds, vendors, audit_logs, employees, reports
-- ============================================================

-- ── Helper: is_assistant ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_assistant()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role = 'assistant' FROM public.profiles WHERE id = auth.uid()
$$;

-- ── candidates ───────────────────────────────────────────────
CREATE POLICY "candidates: assistant all"
  ON public.candidates FOR ALL
  USING (public.is_assistant())
  WITH CHECK (public.is_assistant());

-- ── passports ────────────────────────────────────────────────
CREATE POLICY "passports: assistant all"
  ON public.passports FOR ALL
  USING (public.is_assistant())
  WITH CHECK (public.is_assistant());

-- ── visa_applications ────────────────────────────────────────
CREATE POLICY "visa_applications: assistant all"
  ON public.visa_applications FOR ALL
  USING (public.is_assistant())
  WITH CHECK (public.is_assistant());

-- ── passport_workflow_logs ───────────────────────────────────
CREATE POLICY "passport_workflow_logs: assistant read"
  ON public.passport_workflow_logs FOR SELECT
  USING (public.is_assistant());

-- ── agents — assistant can read (to assign candidates) ───────
CREATE POLICY "agents: assistant read"
  ON public.agents FOR SELECT
  USING (public.is_assistant());

-- ── profiles — assistant can read all (for audit log names) ──
CREATE POLICY "profiles: assistant read all"
  ON public.profiles FOR SELECT
  USING (public.is_assistant());

-- ── notifications — assistant sees own ───────────────────────
-- Already covered by "notifications: own select" policy from
-- the previous migration. No new policy needed.
