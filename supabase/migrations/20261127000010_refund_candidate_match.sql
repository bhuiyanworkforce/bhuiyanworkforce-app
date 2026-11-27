-- A refund can only point at an invoice that belongs to the same candidate.
-- If an invoice is chosen and the candidate is empty, the invoice's candidate is used.
CREATE OR REPLACE FUNCTION public.refunds_candidate_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inv_candidate uuid;
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT candidate_id INTO inv_candidate FROM public.invoices WHERE id = NEW.invoice_id;
    IF NEW.candidate_id IS NULL THEN
      NEW.candidate_id := inv_candidate;
    ELSIF inv_candidate IS DISTINCT FROM NEW.candidate_id THEN
      RAISE EXCEPTION 'This invoice belongs to a different candidate. A refund can only be made against the same candidate''s own invoice.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_refunds_candidate_match ON public.refunds;
CREATE TRIGGER trg_refunds_candidate_match
  BEFORE INSERT OR UPDATE OF invoice_id, candidate_id ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.refunds_candidate_match();
