-- ============================================================
-- Security hardening + notification plumbing fixes
--
-- 1. PRIVILEGE ESCALATION: policy "profiles: own update" lets any signed-in
--    user UPDATE their own profiles row with no column restriction, so anyone
--    (assistant, sub-agent) could run
--        update profiles set role = 'owner' where id = auth.uid()
--    straight from the browser with the public anon key. Block role changes
--    from client sessions; the API (service role) and the SQL editor still work.
--
-- 2. handle_new_user() trusted raw_user_meta_data->>'role'. That field is
--    writable by the user themselves at signup, so if public signups are
--    enabled anyone could create an 'owner'. Only app_metadata (server-only)
--    is trusted now. (users.js was updated to write app_metadata.)
--
-- 3. DB triggers called the send-notification edge function with NO
--    Authorization header, but the function requires INTERNAL_SECRET -> every
--    call returned 401 and payment / overdue emails never arrived. The call
--    now reads the secret from Supabase Vault, and a failed HTTP call can no
--    longer abort the payment insert.
--
-- 4. SECURITY DEFINER functions pinned to a fixed search_path.
--
-- 5. notify_expiring_passports(): server-side replacement for the dashboard's
--    broken per-page-load email call.
--
-- ONE-TIME MANUAL STEP (do NOT put the secret in this file):
--   select vault.create_secret('<same value as INTERNAL_SECRET>', 'internal_secret');
-- Also deploy the edge function with JWT verification off, because it does
-- its own INTERNAL_SECRET check:  supabase functions deploy send-notification --no-verify-jwt
-- ============================================================

-- ── 1. Block self-promotion ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_role_self_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- current_user is the role of the caller: 'authenticated'/'anon' for browser
  -- sessions; 'service_role' (API) or 'postgres' (SQL editor) are allowed.
  IF NEW.role IS DISTINCT FROM OLD.role
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Changing a role is not allowed from a client session';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_change ON public.profiles;
CREATE TRIGGER trg_prevent_role_self_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_change();

-- ── 2. Only trust server-controlled metadata for the role ────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := COALESCE(NEW.raw_app_meta_data->>'role', 'client');
BEGIN
  IF v_role NOT IN ('owner','manager','agent','assistant','client') THEN
    v_role := 'client';
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ── 3. Authenticated, non-fatal notification calls ───────────
CREATE OR REPLACE FUNCTION public.notify_payment_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_invoice_no TEXT;
  v_candidate_name TEXT;
  v_secret TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'internal_secret';

    IF v_secret IS NULL THEN
      RAISE WARNING 'notify_payment_received: vault secret internal_secret not set — email skipped';
      RETURN NEW;
    END IF;

    SELECT i.invoice_no, c.full_name
      INTO v_invoice_no, v_candidate_name
      FROM invoices i JOIN candidates c ON c.id = i.candidate_id
      WHERE i.id = NEW.invoice_id;

    PERFORM net.http_post(
      url := 'https://pfyjkcrswbmtqmwzkexr.supabase.co/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret),
      body := jsonb_build_object(
        'type', 'payment_received',
        'data', jsonb_build_object(
          'invoice_no', v_invoice_no,
          'amount', NEW.amount,
          'receipt_no', COALESCE(NEW.receipt_no, ''),
          'candidate_name', COALESCE(v_candidate_name, '')))
    );
  EXCEPTION WHEN OTHERS THEN
    -- A notification problem must never roll back a real payment.
    RAISE WARNING 'notify_payment_received failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  inv RECORD;
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_overdue_invoices: vault secret internal_secret not set — skipped';
    RETURN;
  END IF;

  FOR inv IN
    SELECT i.invoice_no, i.total, i.due_date, c.full_name
    FROM invoices i
    JOIN candidates c ON c.id = i.candidate_id
    WHERE i.status IN ('unpaid', 'partial')   -- partial invoices can be overdue too
      AND i.due_date < CURRENT_DATE
  LOOP
    PERFORM net.http_post(
      url := 'https://pfyjkcrswbmtqmwzkexr.supabase.co/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret),
      body := jsonb_build_object(
        'type', 'invoice_overdue',
        'data', jsonb_build_object(
          'invoice_no', inv.invoice_no,
          'amount', inv.total,
          'due_date', inv.due_date,
          'candidate_name', COALESCE(inv.full_name, '')))
    );
  END LOOP;
END;
$function$;

-- ── 5. Passport-expiry emails, run server-side ───────────────
-- Schedule weekly (Mondays) to avoid daily repeats, e.g. (if pg_cron is enabled):
--   select cron.schedule('passport-expiry-weekly', '0 4 * * 1',
--                        $$ select public.notify_expiring_passports() $$);
CREATE OR REPLACE FUNCTION public.notify_expiring_passports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  p RECORD;
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_expiring_passports: vault secret internal_secret not set — skipped';
    RETURN;
  END IF;

  FOR p IN
    SELECT ps.passport_no, ps.expiry_date, c.full_name
    FROM passports ps
    LEFT JOIN candidates c ON c.id = ps.candidate_id
    WHERE ps.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
  LOOP
    PERFORM net.http_post(
      url := 'https://pfyjkcrswbmtqmwzkexr.supabase.co/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret),
      body := jsonb_build_object(
        'type', 'passport_expiring',
        'data', jsonb_build_object(
          'candidate_name', COALESCE(p.full_name, 'Unknown'),
          'passport_no', p.passport_no,
          'expiry_date', p.expiry_date))
    );
  END LOOP;
END;
$function$;

-- Only the DB (cron / owner) should run these — not any client via /rpc.
REVOKE EXECUTE ON FUNCTION public.notify_expiring_passports() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_overdue_invoices()  FROM PUBLIC, anon, authenticated;

-- ── 4. Pin search_path on the remaining SECURITY DEFINER helpers ──
ALTER FUNCTION public.is_owner()                     SET search_path = public;
ALTER FUNCTION public.is_assistant()                 SET search_path = public;
ALTER FUNCTION public.get_candidate_stage_counts()   SET search_path = public;
