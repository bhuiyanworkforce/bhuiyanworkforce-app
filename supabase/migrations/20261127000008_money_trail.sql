-- ============================================================
-- Money trail: every payout creates exactly one expense + voucher,
-- cheques carry a reason and settle the thing they pay, refunds get a
-- voucher, and the audit log covers people and money tables with "who".
--
-- Safe to run once in the Supabase SQL editor. Test data in `expenses`
-- is cleared (agreed), then rebuilt from paid payroll, payouts and cleared
-- cheques so the books match the records.
-- ============================================================

-- ── 0. Drop old CHECK constraints that would block new values ─────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid IN ('public.expenses'::regclass)
      AND pg_get_constraintdef(c.oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;

  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid IN ('public.employee_payroll'::regclass, 'public.payroll'::regclass,
                         'public.refunds'::regclass)
      AND pg_get_constraintdef(c.oid) ILIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

-- ── 1. Voucher numbers ────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.voucher_seq;

CREATE OR REPLACE FUNCTION public.next_voucher_no(prefix text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT prefix || '-' || to_char(now() AT TIME ZONE 'Asia/Dhaka', 'YY') || '-' ||
         lpad(nextval('public.voucher_seq')::text, 5, '0');
$$;
REVOKE EXECUTE ON FUNCTION public.next_voucher_no(text) FROM PUBLIC, anon;

-- ── 2. Expenses: link to source, voucher, payee ───────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id   uuid,
  ADD COLUMN IF NOT EXISTS voucher_no  text,
  ADD COLUMN IF NOT EXISTS payee_name  text,
  ADD COLUMN IF NOT EXISTS created_by  uuid;

-- Test data is cleared here; rebuilt in section 8.
DELETE FROM public.expenses;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_source_unique
  ON public.expenses (source_type, source_id);   -- NULLs are distinct, so manual rows are unaffected
CREATE UNIQUE INDEX IF NOT EXISTS expenses_voucher_unique
  ON public.expenses (voucher_no) WHERE voucher_no IS NOT NULL;

-- Voucher number + creator on every new expense; salary/commission cannot be typed by hand.
CREATE OR REPLACE FUNCTION public.expenses_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_type IS NULL AND NEW.category IN ('salary', 'commission') THEN
    RAISE EXCEPTION 'Salary and commission expenses are created automatically when you pay them in Payroll or Sub Agents.';
  END IF;
  IF NEW.voucher_no IS NULL THEN NEW.voucher_no := public.next_voucher_no('PV'); END IF;
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_expenses_before_insert ON public.expenses;
CREATE TRIGGER trg_expenses_before_insert
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_before_insert();

-- Auto-created expenses cannot be edited or deleted from the app.
-- (SQL editor / service role has no auth.uid(), so corrections stay possible there.)
CREATE OR REPLACE FUNCTION public.expenses_lock_system_rows()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.source_type IS NOT NULL AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'This expense was created automatically from a payment and cannot be changed here.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS trg_expenses_lock ON public.expenses;
CREATE TRIGGER trg_expenses_lock
  BEFORE UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_lock_system_rows();

-- Generic guard: posted money records cannot be reopened or deleted from the app.
-- args: status column, posted value ('*' = always posted)
CREATE OR REPLACE FUNCTION public.guard_posted_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE posted boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  posted := TG_ARGV[1] = '*' OR (to_jsonb(OLD) ->> TG_ARGV[0]) = TG_ARGV[1];
  IF NOT posted THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A posted % record cannot be deleted. Its money is already in the books.', TG_TABLE_NAME;
  END IF;
  IF TG_ARGV[1] = '*' THEN
    RAISE EXCEPTION 'A posted % record cannot be edited. Record a new entry instead.', TG_TABLE_NAME;
  END IF;
  IF (to_jsonb(NEW) ->> TG_ARGV[0]) IS DISTINCT FROM TG_ARGV[1] THEN
    RAISE EXCEPTION 'A % record that is already % cannot be reopened.', TG_TABLE_NAME, TG_ARGV[1];
  END IF;
  RETURN NEW;
END $$;

-- ── 3. Employee payroll -> expense (salary) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.post_employee_payroll()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE nm text;
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    SELECT name INTO nm FROM public.employees WHERE id = NEW.employee_id;
    INSERT INTO public.expenses (date, category, description, amount, payment_method, source_type, source_id, payee_name)
    VALUES (COALESCE(NEW.payment_date, CURRENT_DATE), 'salary',
            'Salary - ' || COALESCE(nm, 'employee') || ' (' || NEW.month || '/' || NEW.year || ')',
            COALESCE(NEW.net_salary, 0), COALESCE(NEW.payment_method, 'cash'),
            'employee_payroll', NEW.id, nm)
    ON CONFLICT (source_type, source_id) DO NOTHING;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_post_employee_payroll ON public.employee_payroll;
CREATE TRIGGER trg_post_employee_payroll
  AFTER INSERT OR UPDATE ON public.employee_payroll
  FOR EACH ROW EXECUTE FUNCTION public.post_employee_payroll();

DROP TRIGGER IF EXISTS trg_guard_employee_payroll ON public.employee_payroll;
CREATE TRIGGER trg_guard_employee_payroll
  BEFORE UPDATE OR DELETE ON public.employee_payroll
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_row('status', 'paid');

-- ── 4. Sub-agent payroll -> expense (commission) ──────────────────────────
CREATE OR REPLACE FUNCTION public.post_agent_payroll()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE nm text;
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    SELECT full_name INTO nm FROM public.sub_agents WHERE id = NEW.sub_agent_id;
    INSERT INTO public.expenses (date, category, description, amount, payment_method, source_type, source_id, payee_name)
    VALUES (COALESCE(NEW.paid_at::date, CURRENT_DATE), 'commission',
            'Sub agent payroll - ' || COALESCE(nm, 'sub agent'),
            COALESCE(NEW.net_amount, NEW.net_salary, 0), COALESCE(NEW.payment_method, 'cash'),
            'payroll', NEW.id, nm)
    ON CONFLICT (source_type, source_id) DO NOTHING;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_post_agent_payroll ON public.payroll;
CREATE TRIGGER trg_post_agent_payroll
  AFTER INSERT OR UPDATE ON public.payroll
  FOR EACH ROW EXECUTE FUNCTION public.post_agent_payroll();

DROP TRIGGER IF EXISTS trg_guard_agent_payroll ON public.payroll;
CREATE TRIGGER trg_guard_agent_payroll
  BEFORE UPDATE OR DELETE ON public.payroll
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_row('status', 'paid');

-- ── 5. Sub-agent commission payouts -> expense ────────────────────────────
ALTER TABLE public.sub_agent_payouts
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';

CREATE OR REPLACE FUNCTION public.post_sub_agent_payout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE nm text;
BEGIN
  SELECT full_name INTO nm FROM public.sub_agents WHERE id = NEW.sub_agent_id;
  INSERT INTO public.expenses (date, category, description, amount, payment_method, source_type, source_id, payee_name)
  VALUES (COALESCE(NEW.paid_at::date, CURRENT_DATE), 'commission',
          'Commission payout - ' || COALESCE(nm, 'sub agent') || COALESCE(' (' || NULLIF(NEW.notes, '') || ')', ''),
          NEW.amount, COALESCE(NEW.payment_method, 'cash'),
          'sub_agent_payout', NEW.id, nm)
  ON CONFLICT (source_type, source_id) DO NOTHING;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_post_sub_agent_payout ON public.sub_agent_payouts;
CREATE TRIGGER trg_post_sub_agent_payout
  AFTER INSERT ON public.sub_agent_payouts
  FOR EACH ROW EXECUTE FUNCTION public.post_sub_agent_payout();

DROP TRIGGER IF EXISTS trg_guard_sub_agent_payout ON public.sub_agent_payouts;
CREATE TRIGGER trg_guard_sub_agent_payout
  BEFORE UPDATE OR DELETE ON public.sub_agent_payouts
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_row('id', '*');

-- ── 6. Refunds: voucher on payment, counted against revenue ───────────────
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS voucher_no text,
  ADD COLUMN IF NOT EXISTS paid_at    timestamptz;

CREATE OR REPLACE FUNCTION public.refunds_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inv_paid numeric; already numeric;
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    -- A refund cannot exceed what was received on its invoice (minus earlier paid refunds).
    IF NEW.invoice_id IS NOT NULL THEN
      SELECT COALESCE(SUM(amount), 0) INTO inv_paid FROM public.payments WHERE invoice_id = NEW.invoice_id;
      SELECT COALESCE(SUM(amount), 0) INTO already FROM public.refunds
        WHERE invoice_id = NEW.invoice_id AND status = 'paid' AND id IS DISTINCT FROM NEW.id;
      IF NEW.amount + already > inv_paid + 0.01 THEN
        RAISE EXCEPTION 'Refund of % exceeds the % received on this invoice (already refunded %).',
          NEW.amount, inv_paid, already;
      END IF;
    END IF;
    IF NEW.voucher_no IS NULL THEN NEW.voucher_no := public.next_voucher_no('RV'); END IF;
    IF NEW.paid_at IS NULL THEN NEW.paid_at := now(); END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_refunds_before_write ON public.refunds;
CREATE TRIGGER trg_refunds_before_write
  BEFORE INSERT OR UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.refunds_before_write();

DROP TRIGGER IF EXISTS trg_guard_refunds ON public.refunds;
CREATE TRIGGER trg_guard_refunds
  BEFORE UPDATE OR DELETE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_row('status', 'paid');

-- ── 7. Cheques: reason required, clearing settles the real thing ──────────
ALTER TABLE public.cheques
  ADD COLUMN IF NOT EXISTS reason_category text,
  ADD COLUMN IF NOT EXISTS reason          text,
  ADD COLUMN IF NOT EXISTS invoice_id      uuid REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS linked_type     text,   -- employee_payroll | payroll | sub_agent | refund
  ADD COLUMN IF NOT EXISTS linked_id       uuid,
  ADD COLUMN IF NOT EXISTS cleared_at      timestamptz;

UPDATE public.cheques SET reason = 'Entered before reasons were required'
  WHERE reason IS NULL OR btrim(reason) = '';
UPDATE public.cheques SET reason_category = CASE WHEN type = 'receivable' THEN 'invoice' ELSE 'other' END
  WHERE reason_category IS NULL;

ALTER TABLE public.cheques DROP CONSTRAINT IF EXISTS cheques_reason_required;
ALTER TABLE public.cheques ADD CONSTRAINT cheques_reason_required
  CHECK (reason IS NOT NULL AND btrim(reason) <> '' AND reason_category IS NOT NULL);

CREATE OR REPLACE FUNCTION public.cheques_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cat text;
BEGIN
  -- Rules checked when the cheque is created or edited
  IF NEW.type = 'receivable' AND NEW.invoice_id IS NULL AND NEW.status = 'pending' AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'A receivable cheque must be linked to the invoice it pays.';
  END IF;
  IF NEW.type = 'payable' AND TG_OP = 'INSERT' THEN
    IF NEW.reason_category IN ('salary', 'commission', 'refund') AND (NEW.linked_type IS NULL OR NEW.linked_id IS NULL) THEN
      RAISE EXCEPTION 'A % cheque must be linked to the payroll, sub agent or refund it pays.', NEW.reason_category;
    END IF;
  END IF;

  -- Cleared cheques stay cleared
  IF TG_OP = 'UPDATE' AND OLD.status = 'cleared' AND NEW.status IS DISTINCT FROM 'cleared' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'A cleared cheque cannot be reopened.';
  END IF;

  -- Clearing: post the money exactly once
  IF NEW.status = 'cleared' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'cleared') THEN
    NEW.cleared_at := COALESCE(NEW.cleared_at, now());

    IF NEW.type = 'receivable' THEN
      IF NEW.invoice_id IS NULL THEN
        RAISE EXCEPTION 'Link this cheque to an invoice before clearing it.';
      END IF;
      INSERT INTO public.payments (invoice_id, amount, method, notes, received_by)
      VALUES (NEW.invoice_id, NEW.amount, 'cheque',
              'Cheque ' || NEW.cheque_no || ' - ' || NEW.party_name, auth.uid());

    ELSIF NEW.linked_type = 'employee_payroll' THEN
      UPDATE public.employee_payroll
         SET status = 'paid', payment_method = 'cheque', payment_date = CURRENT_DATE
       WHERE id = NEW.linked_id AND status <> 'paid';
    ELSIF NEW.linked_type = 'payroll' THEN
      UPDATE public.payroll
         SET status = 'paid', payment_method = 'cheque', paid_at = now()
       WHERE id = NEW.linked_id AND status <> 'paid';
    ELSIF NEW.linked_type = 'refund' THEN
      UPDATE public.refunds
         SET status = 'paid', payment_method = 'cheque'
       WHERE id = NEW.linked_id AND status <> 'paid';
    ELSIF NEW.linked_type = 'sub_agent' THEN
      INSERT INTO public.sub_agent_payouts (sub_agent_id, amount, notes, paid_by, payment_method)
      VALUES (NEW.linked_id, NEW.amount, 'Cheque ' || NEW.cheque_no, auth.uid(), 'cheque');
    ELSE
      cat := CASE WHEN NEW.reason_category IN ('rent', 'embassy_fee', 'medical', 'travel', 'office')
                  THEN NEW.reason_category ELSE 'other' END;
      INSERT INTO public.expenses (date, category, description, amount, payment_method, reference_no,
                                   source_type, source_id, payee_name)
      VALUES (CURRENT_DATE, cat, 'Cheque cleared - ' || NEW.reason, NEW.amount, 'cheque', NEW.cheque_no,
              'cheque', NEW.id, NEW.party_name)
      ON CONFLICT (source_type, source_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cheques_before_write ON public.cheques;
CREATE TRIGGER trg_cheques_before_write
  BEFORE INSERT OR UPDATE ON public.cheques
  FOR EACH ROW EXECUTE FUNCTION public.cheques_before_write();

DROP TRIGGER IF EXISTS trg_guard_cheques_delete ON public.cheques;
CREATE TRIGGER trg_guard_cheques_delete
  BEFORE DELETE ON public.cheques
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_row('status', 'cleared');

-- ── 8. Rebuild expenses from existing paid records (idempotent) ───────────
INSERT INTO public.expenses (date, category, description, amount, payment_method, source_type, source_id, payee_name)
SELECT COALESCE(p.payment_date, CURRENT_DATE), 'salary',
       'Salary - ' || COALESCE(e.name, 'employee') || ' (' || p.month || '/' || p.year || ')',
       COALESCE(p.net_salary, 0), COALESCE(p.payment_method, 'cash'), 'employee_payroll', p.id, e.name
FROM public.employee_payroll p LEFT JOIN public.employees e ON e.id = p.employee_id
WHERE p.status = 'paid'
ON CONFLICT (source_type, source_id) DO NOTHING;

INSERT INTO public.expenses (date, category, description, amount, payment_method, source_type, source_id, payee_name)
SELECT COALESCE(p.paid_at::date, CURRENT_DATE), 'commission',
       'Sub agent payroll - ' || COALESCE(a.full_name, 'sub agent'),
       COALESCE(p.net_amount, p.net_salary, 0), COALESCE(p.payment_method, 'cash'), 'payroll', p.id, a.full_name
FROM public.payroll p LEFT JOIN public.sub_agents a ON a.id = p.sub_agent_id
WHERE p.status = 'paid'
ON CONFLICT (source_type, source_id) DO NOTHING;

INSERT INTO public.expenses (date, category, description, amount, payment_method, source_type, source_id, payee_name)
SELECT COALESCE(p.paid_at::date, CURRENT_DATE), 'commission',
       'Commission payout - ' || COALESCE(a.full_name, 'sub agent'),
       p.amount, COALESCE(p.payment_method, 'cash'), 'sub_agent_payout', p.id, a.full_name
FROM public.sub_agent_payouts p LEFT JOIN public.sub_agents a ON a.id = p.sub_agent_id
ON CONFLICT (source_type, source_id) DO NOTHING;

INSERT INTO public.expenses (date, category, description, amount, payment_method, reference_no, source_type, source_id, payee_name)
SELECT COALESCE(c.cleared_at::date, c.due_date, CURRENT_DATE), 'other',
       'Cheque cleared - ' || c.reason, c.amount, 'cheque', c.cheque_no, 'cheque', c.id, c.party_name
FROM public.cheques c
WHERE c.type = 'payable' AND c.status = 'cleared'
ON CONFLICT (source_type, source_id) DO NOTHING;

UPDATE public.refunds SET voucher_no = public.next_voucher_no('RV'), paid_at = COALESCE(paid_at, now())
WHERE status = 'paid' AND voucher_no IS NULL;

-- ── 9. Audit log: one function, records WHO, covers people + money ────────
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rec jsonb; rid uuid; actor uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NULL; END IF;
  actor := auth.uid();
  rec := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  BEGIN rid := (rec ->> 'id')::uuid; EXCEPTION WHEN others THEN rid := NULL; END;

  INSERT INTO public.audit_logs (table_name, action, record_id, old_data, new_data, changed_by, user_id)
  VALUES (TG_TABLE_NAME, TG_OP, rid,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
          actor, actor);
  RETURN NULL;
END $$;

-- Remove every trigger that used the old log_audit(), then attach the new one.
DO $$
DECLARE r record; t text;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, g.tgname
    FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
    JOIN pg_proc p ON p.oid = g.tgfoid
    WHERE NOT g.tgisinternal AND p.proname = 'log_audit'
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.%I', r.tgname, r.tbl);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'candidates','cheques','expenses','invoices','invoice_items','payments','passports',
    'payroll','employee_payroll','refunds','vendors','sub_agents','sub_agent_payouts',
    'employees','agents','employers','visa_applications'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'audit_' || t, t);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()', 'audit_' || t, t);
    END IF;
  END LOOP;
END $$;

-- The Loans module is retired. Tables stay for now; nothing in the app writes to them.
