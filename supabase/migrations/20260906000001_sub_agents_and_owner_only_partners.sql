-- ============================================================
-- Restructure "agents" into three distinct entities:
--
--   sub_agents  — Bangladeshi commission recruiters who supply
--                 candidates (was previously just called "agents").
--                 Same table, same login-role behaviour ('agent'
--                 role), just renamed for clarity now that the word
--                 "agents" means something else in this app.
--
--   agents      — NEW. International intermediaries who bring in
--                 job placements (e.g. Serbia/Poland/Bosnia chains).
--                 Owner-only visibility.
--
--   employers   — NEW. Companies that hire directly, with no
--                 intermediary. Owner-only visibility.
--
-- Renaming the table and column is safe: Postgres tracks foreign
-- keys, views, and RLS policies by object id internally, not by the
-- literal text of their old names, so every existing constraint and
-- policy that referenced public.agents / *.agent_id keeps working
-- unchanged after this rename. The historical migration files that
-- created those policies are left untouched on purpose — migrations
-- are a record of what happened, not a live description of the
-- current schema.
--
-- NOTE ON THE 'agent' LOGIN ROLE: profiles.role still uses the
-- literal value 'agent' for sub-agent portal logins. That value is
-- an internal identifier, not a business entity name, and changing
-- it would require a data migration on every existing profile row
-- for no functional benefit — so it is deliberately left as-is.
-- Only the business-facing table/column names change here.
-- ============================================================

-- ── Rename the existing business entity ─────────────────────
ALTER TABLE public.agents RENAME TO sub_agents;
ALTER TABLE public.agent_payouts RENAME TO sub_agent_payouts;

ALTER TABLE public.candidates RENAME COLUMN agent_id TO sub_agent_id;
ALTER TABLE public.invoices RENAME COLUMN agent_id TO sub_agent_id;
ALTER TABLE public.loans RENAME COLUMN agent_id TO sub_agent_id;
ALTER TABLE public.payroll RENAME COLUMN agent_id TO sub_agent_id;
ALTER TABLE public.sub_agent_payouts RENAME COLUMN agent_id TO sub_agent_id;

-- ── Owner-only helper ────────────────────────────────────────
-- Distinct from auth.is_staff() (owner OR manager). The two new
-- tables below are visible to the owner alone — not manager,
-- not assistant, not sub-agents.
--
-- Lives in public, not auth, matching this project's own
-- public.is_assistant() precedent — the auth schema is locked
-- down for regular SQL-editor sessions in current Supabase
-- projects, even though earlier auth.* helpers in this database
-- were created through a different, more privileged path.
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role = 'owner' FROM public.profiles WHERE id = auth.uid()
$$;

-- ── agents: international intermediary partners ─────────────
CREATE TABLE public.agents (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  country text,
  corridor text,                    -- e.g. "Serbia placement chain"

  contact_name text,
  contact_phone text,
  contact_email text,

  -- due-diligence fields
  registry_status text not null default 'pending',   -- verified | pending | not_found
  address_type text not null default 'unknown',       -- commercial | residential | unknown
  chain_depth text not null default 'direct',          -- direct | one_intermediary | two_plus
  years_active numeric,

  status text not null default 'active',   -- active | inactive
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents (intermediaries): owner only"
  ON public.agents FOR ALL
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

-- ── employers: companies that hire directly ─────────────────
CREATE TABLE public.employers (
  id uuid primary key default gen_random_uuid(),

  company_name text not null,
  country text,
  industry text,

  contact_name text,
  contact_phone text,
  contact_email text,

  contract_status text not null default 'prospect',  -- prospect | negotiating | active | inactive
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employers: owner only"
  ON public.employers FOR ALL
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

-- ── shared updated_at trigger for the two new tables ────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agents_touch_updated_at ON public.agents;
CREATE TRIGGER agents_touch_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS employers_touch_updated_at ON public.employers;
CREATE TRIGGER employers_touch_updated_at
  BEFORE UPDATE ON public.employers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_agents_status ON public.agents (status);
CREATE INDEX IF NOT EXISTS idx_employers_contract_status ON public.employers (contract_status);
