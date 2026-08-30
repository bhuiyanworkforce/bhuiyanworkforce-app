-- ============================================================
-- Fix: get_candidate_stage_counts() was counting every candidate,
-- archived or not, into the pipeline stage pills (New, Screening,
-- etc.) at the top of the Candidates list. Since archiving was
-- added to hide candidates from the active view, those pills should
-- only reflect the active roster — same fix already applied to the
-- JS fallback that runs if this RPC is ever unavailable.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_candidate_stage_counts()
 RETURNS TABLE(status text, count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select coalesce(status, 'new') as status, count(*) as count
    from candidates
    where archived_at is null
      group by coalesce(status, 'new');
      $function$
