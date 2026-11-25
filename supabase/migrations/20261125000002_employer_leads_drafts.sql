-- ============================================================
-- Per-lead email drafts
--
-- Lets a lead carry its own pre-written subject and body (for example the
-- Greek emails from a spreadsheet import). The composer opens with these
-- instead of the generic template; the owner still edits and sends manually.
-- Additive only: existing rows keep NULL and fall back to the template.
--
-- ROLLBACK:
--   ALTER TABLE public.employer_leads
--     DROP COLUMN IF EXISTS draft_subject,
--     DROP COLUMN IF EXISTS draft_body;
-- ============================================================

ALTER TABLE public.employer_leads
  ADD COLUMN IF NOT EXISTS draft_subject text,
  ADD COLUMN IF NOT EXISTS draft_body text;
