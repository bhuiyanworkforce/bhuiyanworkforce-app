-- ============================================================
-- Sub agents (role 'agent') can see ONLY their own candidates.
--
-- 20261126000006 let sub agents also read their own passports, visa
-- applications, invoices, invoice items, loans and loan repayments. Removed
-- here. Kept: candidates (assigned to them) and their own sub_agents row
-- (needed so the candidates policy can find which sub agent they are).
--
-- Also: one login can be linked to only one sub agent. The candidates policy
-- uses "LIMIT 1" to find a sub agent by profile_id, so two sub agents sharing
-- one login would make access ambiguous.
-- ============================================================

DROP POLICY IF EXISTS "passports: sub-agent read assigned"          ON public.passports;
DROP POLICY IF EXISTS "visa_applications: sub-agent read assigned"  ON public.visa_applications;
DROP POLICY IF EXISTS "invoices: sub-agent read own"                ON public.invoices;
DROP POLICY IF EXISTS "invoice_items: sub-agent read own invoices"  ON public.invoice_items;
DROP POLICY IF EXISTS "loans: sub-agent read own"                   ON public.loans;
DROP POLICY IF EXISTS "loan_repayments: sub-agent read own"         ON public.loan_repayments;

CREATE UNIQUE INDEX IF NOT EXISTS sub_agents_profile_id_unique
  ON public.sub_agents (profile_id)
  WHERE profile_id IS NOT NULL;
