-- ============================================================
-- Fix 1: create_receipt_on_payment recorded guessed data, not real
-- payment data.
--
-- It used to be a trigger on invoices (AFTER UPDATE), firing once
-- whenever status flipped to 'paid', and inserted a receipt using
-- NEW.total (the invoice's full total — wrong for partial payments)
-- and a hardcoded payment_method of 'cash' (wrong whenever any other
-- method was used). Nothing in the app currently reads
-- money_receipts, so this wasn't corrupting anything visible, but it
-- was quietly building a wrong financial record for anyone who ever
-- queries it directly, or any future feature built on it.
--
-- Fix: move this to fire on payments (AFTER INSERT) instead of
-- invoices — one receipt per actual payment received, with that
-- payment's real amount and real method. This also fixes multi-
-- payment invoices: previously a candidate paying in two
-- installments only produced one (wrong) receipt when the second
-- payment completed it; now each payment gets its own accurate one.
-- ============================================================

DROP TRIGGER IF EXISTS trg_receipt_on_payment ON public.invoices;

CREATE OR REPLACE FUNCTION public.create_receipt_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_candidate_id uuid;
BEGIN
  SELECT candidate_id INTO v_candidate_id
    FROM public.invoices
    WHERE id = NEW.invoice_id;

  INSERT INTO public.money_receipts (invoice_id, candidate_id, amount, payment_method)
  VALUES (NEW.invoice_id, v_candidate_id, NEW.amount, NEW.method);

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_receipt_on_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_receipt_on_payment();


-- ============================================================
-- Fix 2: notify_payment_received and notify_overdue_invoices build
-- their webhook JSON payload by raw string concatenation:
--   '{"type":"...","data":{"candidate_name":"' || name || '"}}'
-- If `name` (or invoice_no, or anything else interpolated this way)
-- ever contains a double quote or backslash — a stray character from
-- copy-pasted text, a smart quote, an apostrophe-like character in a
-- transliterated name — the resulting string is not valid JSON, the
-- `::jsonb` cast throws, and since these run inside triggers on
-- `payments` and are invoked around invoice status, THE ENTIRE
-- PAYMENT INSERT WOULD FAIL. This is a live landmine: recording a
-- payment for a candidate whose name happens to contain a
-- problematic character would currently be impossible, with no
-- indication why.
--
-- Fix: build the JSON with jsonb_build_object, which handles
-- escaping correctly regardless of what's inside the values.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_payment_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_invoice_no TEXT;
  v_candidate_name TEXT;
  v_body jsonb;
BEGIN
  SELECT i.invoice_no, c.full_name
    INTO v_invoice_no, v_candidate_name
    FROM invoices i
    JOIN candidates c ON c.id = i.candidate_id
    WHERE i.id = NEW.invoice_id;

  v_body := jsonb_build_object(
    'type', 'payment_received',
    'data', jsonb_build_object(
      'invoice_no', v_invoice_no,
      'amount', NEW.amount,
      'receipt_no', COALESCE(NEW.receipt_no, ''),
      'candidate_name', COALESCE(v_candidate_name, '')
    )
  );

  PERFORM net.http_post(
    url := 'https://pfyjkcrswbmtqmwzkexr.supabase.co/functions/v1/send-notification',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := v_body
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  inv RECORD;
  v_body jsonb;
BEGIN
  FOR inv IN
    SELECT i.invoice_no, i.total, i.due_date, c.full_name
    FROM invoices i
    JOIN candidates c ON c.id = i.candidate_id
    WHERE i.status = 'unpaid'
      AND i.due_date < CURRENT_DATE
  LOOP
    v_body := jsonb_build_object(
      'type', 'invoice_overdue',
      'data', jsonb_build_object(
        'invoice_no', inv.invoice_no,
        'amount', inv.total,
        'due_date', inv.due_date,
        'candidate_name', COALESCE(inv.full_name, '')
      )
    );

    PERFORM net.http_post(
      url := 'https://pfyjkcrswbmtqmwzkexr.supabase.co/functions/v1/send-notification',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := v_body
    );
  END LOOP;
END;
$function$;
