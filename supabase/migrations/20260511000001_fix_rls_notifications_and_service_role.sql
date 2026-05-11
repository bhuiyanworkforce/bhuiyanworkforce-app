-- ============================================================
-- Fix 1: auth.is_service_role() — use correct PostgREST role
--
-- The previous implementation compared current_setting('role')
-- to 'service_role', but PostgREST actually sets the role to
-- 'authenticator' for all requests (including service-role ones).
-- The service_role bypass is communicated via a custom JWT claim,
-- not via the pg role name. Supabase's own recommended pattern is
-- to check auth.jwt() ->> 'role' instead.
--
-- This means the previous function always returned false, causing
-- the audit_logs service-role INSERT policy and the notifications
-- service-role INSERT policy to silently block writes from the
-- API and Edge Functions.
-- ============================================================

CREATE OR REPLACE FUNCTION auth.is_service_role()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

-- ============================================================
-- Fix 2: notifications — split the conflicting INSERT policies
--
-- The previous 'notifications: own all' policy used FOR ALL with:
--   WITH CHECK (user_id = auth.uid())
-- This conflicts with 'notifications: service role insert' on INSERT
-- because both policies are evaluated for INSERT and Supabase uses
-- permissive (OR) semantics — meaning the wrong policy could allow
-- or block based on evaluation order.
--
-- Fix: replace FOR ALL with explicit SELECT / UPDATE / DELETE so the
-- INSERT path is owned exclusively by the service-role policy.
-- ============================================================

-- Drop the old catch-all policy
DROP POLICY IF EXISTS "notifications: own all" ON public.notifications;

-- Users can read their own notifications
CREATE POLICY "notifications: own select"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "notifications: own update"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "notifications: own delete"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());

-- Service role (API / Edge Functions) may insert for any user_id
-- (Policy already exists from the previous migration — kept as-is)
-- CREATE POLICY "notifications: service role insert" ...
