-- ============================================================
-- Add candidate archiving
--
-- Candidates with financial history (invoices, refunds, payments)
-- can't be hard-deleted — the foreign key constraints that protect
-- that history correctly refuse it. Until now the only option for a
-- candidate you no longer want to see day-to-day was... nothing.
-- This adds a soft-delete style "archived" state instead: hidden
-- from the active list and every selection dropdown across the app,
-- fully restorable, financial history untouched.
--
-- `archived_at` is nullable: NULL means active, a timestamp means
-- archived (and records when). This also means "is this candidate
-- archived" and "when was it archived" are the same column instead
-- of needing two.
-- ============================================================

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Every list/dropdown query will filter on this column, so index it.
CREATE INDEX IF NOT EXISTS idx_candidates_archived_at
  ON public.candidates (archived_at);
