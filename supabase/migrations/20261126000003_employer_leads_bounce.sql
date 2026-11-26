-- Employer leads: remember when an email to the lead's address bounced.
-- The inbox check sets email_bounced when it reads a delivery-failure notice;
-- sending is switched off for that lead until the address is corrected.
--
-- Rollback:
--   ALTER TABLE public.employer_leads DROP COLUMN IF EXISTS email_bounced, DROP COLUMN IF EXISTS email_bounced_at;

ALTER TABLE public.employer_leads
  ADD COLUMN IF NOT EXISTS email_bounced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_bounced_at timestamptz;
