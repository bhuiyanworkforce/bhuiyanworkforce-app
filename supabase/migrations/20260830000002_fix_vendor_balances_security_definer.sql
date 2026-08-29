-- ============================================================
-- Fix: public.vendor_balances flagged as a Security Definer View
-- by Supabase's Security Advisor.
--
-- By default a Postgres view runs with the permissions of its
-- owner, not the querying user. If the owner can see all rows
-- (which it normally can, since views are typically owned by a
-- superuser/service role in Supabase), the view silently bypasses
-- the RLS policies on its underlying tables (vendors,
-- vendor_transactions) — a user with restricted access to those
-- tables could still see everything through this view.
--
-- Fix: turn on security_invoker so the view runs as the querying
-- user instead, and RLS on vendors / vendor_transactions applies
-- normally.
-- ============================================================

ALTER VIEW public.vendor_balances SET (security_invoker = on);
