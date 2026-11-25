-- ============================================================
-- Employer lead pipeline
--
-- employer_leads            — prospective hiring companies, BEFORE they
--                             become a row in public.employers. Owner-only.
-- employer_lead_activities  — timeline: notes, emails sent, replies,
--                             WhatsApp opened, stage changes. Owner-only.
--
-- Design rules baked in:
--   * Vetting is part of the record (registry check, address type, verdict)
--     so a lead cannot be emailed from the API until vetting_status = 'passed'.
--   * do_not_contact is a hard flag the API refuses to send past.
--   * No bulk tables, no scraped-number staging. One lead = one researched company.
--
-- Reuses public.is_owner() and public.touch_updated_at() created in
-- 20260906000001_sub_agents_and_owner_only_partners.sql.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.employer_lead_activities;
--   DROP TABLE IF EXISTS public.employer_leads;
-- ============================================================

CREATE TABLE public.employer_leads (
  id uuid primary key default gen_random_uuid(),

  company_name text not null,
  country text,
  industry text,
  website text,

  -- where this lead came from, so every lead is traceable to a real source
  source_type text not null default 'other',   -- registry | job_board | referral | event | website | other
  source_url text,

  contact_name text,
  contact_role text,
  contact_email text,
  contact_phone text,

  roles_needed text,

  -- pipeline
  stage text not null default 'new',           -- new | researching | vetted | contacted | replied | negotiating | won | lost
  next_follow_up date,
  first_contacted_at timestamptz,
  last_contacted_at timestamptz,

  -- vetting
  registry_checked boolean not null default false,
  address_type text not null default 'unknown', -- commercial | residential | unknown
  vetting_status text not null default 'pending', -- pending | passed | hold | refused
  vetting_notes text,

  do_not_contact boolean not null default false,

  converted_employer_id uuid references public.employers(id) on delete set null,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),

  CONSTRAINT employer_leads_stage_chk CHECK (stage IN
    ('new','researching','vetted','contacted','replied','negotiating','won','lost')),
  CONSTRAINT employer_leads_source_chk CHECK (source_type IN
    ('registry','job_board','referral','event','website','other')),
  CONSTRAINT employer_leads_address_chk CHECK (address_type IN
    ('commercial','residential','unknown')),
  CONSTRAINT employer_leads_vetting_chk CHECK (vetting_status IN
    ('pending','passed','hold','refused'))
);

-- Same company in the same country cannot be added twice.
CREATE UNIQUE INDEX employer_leads_company_country_uq
  ON public.employer_leads (lower(company_name), coalesce(lower(country), ''));

CREATE INDEX idx_employer_leads_stage ON public.employer_leads (stage);
CREATE INDEX idx_employer_leads_follow_up ON public.employer_leads (next_follow_up)
  WHERE next_follow_up IS NOT NULL;

ALTER TABLE public.employer_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employer_leads: owner only"
  ON public.employer_leads FOR ALL
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

DROP TRIGGER IF EXISTS employer_leads_touch_updated_at ON public.employer_leads;
CREATE TRIGGER employer_leads_touch_updated_at
  BEFORE UPDATE ON public.employer_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── activity timeline ────────────────────────────────────────
CREATE TABLE public.employer_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.employer_leads(id) on delete cascade,
  kind text not null,                -- note | email_sent | reply | whatsapp_opened | call | stage_change | vetting | converted
  summary text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),

  CONSTRAINT employer_lead_activities_kind_chk CHECK (kind IN
    ('note','email_sent','reply','whatsapp_opened','call','stage_change','vetting','converted'))
);

CREATE INDEX idx_employer_lead_activities_lead
  ON public.employer_lead_activities (lead_id, created_at DESC);
CREATE INDEX idx_employer_lead_activities_email_sent
  ON public.employer_lead_activities (created_at DESC) WHERE kind = 'email_sent';

ALTER TABLE public.employer_lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employer_lead_activities: owner only"
  ON public.employer_lead_activities FOR ALL
  USING (public.is_owner())
  WITH CHECK (public.is_owner());
