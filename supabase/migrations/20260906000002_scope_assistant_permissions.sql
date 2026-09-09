-- ============================================================
-- Fix: the 'assistant' role had unrestricted FOR ALL access
-- (including DELETE) on every candidate, passport, and visa
-- application in the business — not scoped to their own work at
-- all, unlike the sub-agent-facing 'agent' role, which is
-- deliberately restricted to its own assigned candidates.
--
-- Two concrete risks this closes:
--   1. A simple mistake (deleting the wrong row) had a much bigger
--      blast radius than it should — an assistant could affect any
--      candidate/passport/visa record company-wide, not just their
--      own work.
--   2. A compromised assistant account had system-wide reach into
--      every candidate's travel documents and visa progress, not
--      just whatever that person was actually assigned.
--
-- Fix: split the single FOR ALL policy into SELECT / INSERT /
-- UPDATE / DELETE per table:
--   - SELECT stays unrestricted — broad read visibility for
--     assistants to help wherever needed is low-risk on its own.
--   - INSERT requires created_by = auth.uid() — guarantees every
--     record an assistant creates is correctly self-attributed.
--     Without this, nothing would stop a client from inserting a
--     row with created_by left blank or set to someone else,
--     which would also make that row un-editable by its creator
--     the moment they tried to fix it.
--   - UPDATE and DELETE are restricted to created_by = auth.uid()
--     — an assistant can only modify or delete records they
--     themselves created, mirroring the same "your own work only"
--     boundary sub-agents already have via sub_agent_id.
--
-- NOTE: any existing candidate/passport/visa_application row with
-- created_by = NULL (created before this attribution was
-- consistently tracked by the app, or via a path that didn't set
-- it) becomes editable/deletable by owner/manager only after this
-- migration — not by any assistant. This is intentional (fail
-- closed rather than fail open), but is a real behavior change:
-- if any assistant currently relies on editing older, unattributed
-- records, that access is now gone until an owner/manager
-- reassigns or updates that record.
-- ============================================================

DROP POLICY IF EXISTS "candidates: assistant all" ON public.candidates;
DROP POLICY IF EXISTS "passports: assistant all" ON public.passports;
DROP POLICY IF EXISTS "visa_applications: assistant all" ON public.visa_applications;

-- ── candidates ───────────────────────────────────────────────
CREATE POLICY "candidates: assistant read all"
  ON public.candidates FOR SELECT
  USING (public.is_assistant());

CREATE POLICY "candidates: assistant insert own"
  ON public.candidates FOR INSERT
  WITH CHECK (public.is_assistant() AND created_by = auth.uid());

CREATE POLICY "candidates: assistant update own"
  ON public.candidates FOR UPDATE
  USING (public.is_assistant() AND created_by = auth.uid())
  WITH CHECK (public.is_assistant() AND created_by = auth.uid());

CREATE POLICY "candidates: assistant delete own"
  ON public.candidates FOR DELETE
  USING (public.is_assistant() AND created_by = auth.uid());

-- ── passports ────────────────────────────────────────────────
CREATE POLICY "passports: assistant read all"
  ON public.passports FOR SELECT
  USING (public.is_assistant());

CREATE POLICY "passports: assistant insert own"
  ON public.passports FOR INSERT
  WITH CHECK (public.is_assistant() AND created_by = auth.uid());

CREATE POLICY "passports: assistant update own"
  ON public.passports FOR UPDATE
  USING (public.is_assistant() AND created_by = auth.uid())
  WITH CHECK (public.is_assistant() AND created_by = auth.uid());

CREATE POLICY "passports: assistant delete own"
  ON public.passports FOR DELETE
  USING (public.is_assistant() AND created_by = auth.uid());

-- ── visa_applications ────────────────────────────────────────
CREATE POLICY "visa_applications: assistant read all"
  ON public.visa_applications FOR SELECT
  USING (public.is_assistant());

CREATE POLICY "visa_applications: assistant insert own"
  ON public.visa_applications FOR INSERT
  WITH CHECK (public.is_assistant() AND created_by = auth.uid());

CREATE POLICY "visa_applications: assistant update own"
  ON public.visa_applications FOR UPDATE
  USING (public.is_assistant() AND created_by = auth.uid())
  WITH CHECK (public.is_assistant() AND created_by = auth.uid());

CREATE POLICY "visa_applications: assistant delete own"
  ON public.visa_applications FOR DELETE
  USING (public.is_assistant() AND created_by = auth.uid());
