-- ============================================================
-- READ-ONLY RLS verification. Paste into the Supabase SQL editor, one block
-- at a time. Nothing here changes data. Every block should return the
-- "expected" result noted above it.
-- ============================================================

-- 1) EXPECTED: zero rows. Any public table listed here is open to anyone
--    holding the anon key (the base schema is not in the repo, so this is the
--    only way to be sure).
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 2) EXPECTED: zero rows. RLS is on but no policy exists, so the table is
--    locked for everyone except the service role (usually a mistake).
select c.relname as rls_on_but_no_policy
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
order by 1;

-- 3) EXPECTED: zero rows. Policies that apply to anon / PUBLIC or use a
--    constant-true condition.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public','storage')
  and (qual = 'true' or with_check = 'true' or 'anon' = any(roles));

-- 4) Full policy list for review (candidates, passports, payments, profiles first).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 5) EXPECTED: documents bucket private (public = false), avatars public.
--    The repo contains NO storage policies, so check block 6 carefully.
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;

-- 6) EXPECTED: documents -> only staff (and assistants if intended) can
--    select/insert/delete; no policy with a true condition. avatars -> write
--    limited to the owner's own folder.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- 7) EXPECTED: every view shows security_invoker=on (otherwise it bypasses RLS).
select c.relname as view_name, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v';

-- 8) EXPECTED: prevent_role_self_change trigger present on profiles.
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal;

-- 9) Anon-callable SECURITY DEFINER functions in public. EXPECTED: only
--    harmless helpers (is_owner / is_assistant). notify_* and
--    get_candidate_stage_counts should NOT appear after the migration.
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;

-- 10) EXPECTED: every owner/manager/assistant/agent has a matching profile
--     row and no unexpected owners.
select role, count(*) from public.profiles group by role order by 1;

-- 11) Old rows an assistant can no longer edit (created_by null).
select 'candidates' t, count(*) from public.candidates where created_by is null
union all select 'passports', count(*) from public.passports where created_by is null
union all select 'visa_applications', count(*) from public.visa_applications where created_by is null;
