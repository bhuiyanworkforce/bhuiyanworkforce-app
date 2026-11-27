-- ============================================================
-- Storage policy fixes (found in the 2026-11-26 RLS audit)
--
-- 1. documents bucket (passport scans, candidate documents): the live
--    policies let ANY signed-in user (sub-agents, 'client' accounts, assistants)
--    read, upload and DELETE every file. Now: owner + manager + assistant can
--    read and upload; only owner + manager can delete. Sub-agents and 'client'
--    accounts get nothing. The candidate_documents TABLE gets matching
--    assistant policies (it previously had owner+manager only, so assistants
--    could not list or add documents even though storage allowed it).
--    Files are stored as <candidate_id>/<timestamp>-<n>.<ext>.
--
-- 2. avatars bucket: the policies were a mix of two incompatible schemes plus
--    leftovers for a bucket id 'AVATARS' (case-sensitive; the app uses
--    'avatars'). The UPDATE/DELETE rules never matched the path the app writes
--    (avatars/<user id>/avatar.<ext>), so replacing an avatar would fail.
--    Rebuilt to match the app's actual path; each user can write only inside
--    their own folder. Public read is kept (avatars are public by design).
-- ============================================================

-- ── documents ────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated users can read documents"   ON storage.objects;
DROP POLICY IF EXISTS "authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated users can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "documents: owner+manager read"   ON storage.objects;
DROP POLICY IF EXISTS "documents: owner+manager insert" ON storage.objects;
DROP POLICY IF EXISTS "documents: staff read"           ON storage.objects;
DROP POLICY IF EXISTS "documents: staff insert"         ON storage.objects;
DROP POLICY IF EXISTS "documents: owner+manager delete" ON storage.objects;

CREATE POLICY "documents: staff read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents'
         AND public.get_my_role() = ANY (ARRAY['owner','manager','assistant']));

CREATE POLICY "documents: staff insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents'
              AND public.get_my_role() = ANY (ARRAY['owner','manager','assistant']));

CREATE POLICY "documents: owner+manager delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents'
         AND public.get_my_role() = ANY (ARRAY['owner','manager']));

-- ── candidate_documents table: assistants may list and add, not edit/delete ──
DROP POLICY IF EXISTS "candidate_documents: assistant read"   ON public.candidate_documents;
DROP POLICY IF EXISTS "candidate_documents: assistant insert" ON public.candidate_documents;

CREATE POLICY "candidate_documents: assistant read"
  ON public.candidate_documents FOR SELECT
  USING (is_assistant());

CREATE POLICY "candidate_documents: assistant insert"
  ON public.candidate_documents FOR INSERT
  WITH CHECK (is_assistant());

-- ── avatars ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public avatar access"                ON storage.objects;
DROP POLICY IF EXISTS "Public avatar read access"           ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar"   ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar"   ON storage.objects;
DROP POLICY IF EXISTS "Users delete own avatar"             ON storage.objects;
DROP POLICY IF EXISTS "Users update own avatar"             ON storage.objects;
DROP POLICY IF EXISTS "Users upload own avatar"             ON storage.objects;
DROP POLICY IF EXISTS "avatars: public read"                ON storage.objects;
DROP POLICY IF EXISTS "avatars: own insert"                 ON storage.objects;
DROP POLICY IF EXISTS "avatars: own update"                 ON storage.objects;
DROP POLICY IF EXISTS "avatars: own delete"                 ON storage.objects;

CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- Path written by Profile.jsx: avatars/<user id>/avatar.<ext>
CREATE POLICY "avatars: own insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars'
              AND (storage.foldername(name))[1] = 'avatars'
              AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "avatars: own update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars'
         AND (storage.foldername(name))[1] = 'avatars'
         AND (storage.foldername(name))[2] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars'
              AND (storage.foldername(name))[1] = 'avatars'
              AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "avatars: own delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars'
         AND (storage.foldername(name))[1] = 'avatars'
         AND (storage.foldername(name))[2] = auth.uid()::text);
