import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

const app = new Hono()

const VALID_ROLES = ['manager', 'agent', 'assistant']

// ── Global error handler — always returns JSON, never plain text ──────────────
app.onError((err, c) => {
  console.error('[users] Unhandled error:', err?.message ?? err)
  return c.json({ error: err?.message ?? 'Internal server error' }, 500)
})

function getSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
}

// Verify the caller is an authenticated owner or manager
async function getCallerProfile(c) {
  const authHeader = c.req.header('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return { error: 'Missing token' }

  if (!c.env.SUPABASE_URL)        return { error: 'SUPABASE_URL not set' }
  if (!c.env.SUPABASE_ANON_KEY)   return { error: 'SUPABASE_ANON_KEY not set' }
  if (!c.env.SUPABASE_SERVICE_KEY) return { error: 'SUPABASE_SERVICE_KEY not set' }

  // Verify the JWT
  const { data: { user }, error: authErr } = await createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ).auth.getUser()

  if (authErr || !user) return { error: `Auth failed: ${authErr?.message ?? 'no user'}` }

  // Fetch their profile to check role
  const { data: profile, error: profileErr } = await getSupabase(c.env)
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile) return { error: `Profile fetch failed: ${profileErr?.message ?? 'not found'}` }

  return { profile }
}

// ── GET /api/v1/users ─────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const result = await getCallerProfile(c)
  if (result.error) return c.json({ error: result.error }, 401)

  const { profile: caller } = result
  if (!['owner', 'manager'].includes(caller.role)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const supabase = getSupabase(c.env)

  const { data: authData, error: authErr } = await supabase.auth.admin.listUsers()
  if (authErr) return c.json({ error: `listUsers failed: ${authErr.message}` }, 500)

  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, full_name, role')
  if (profileErr) return c.json({ error: `profiles fetch failed: ${profileErr.message}` }, 500)

  const profileMap = {}
  for (const p of profiles ?? []) profileMap[p.id] = p

  const users = (authData?.users ?? []).map(u => ({
    id:         u.id,
    email:      u.email,
    full_name:  profileMap[u.id]?.full_name ?? null,
    role:       profileMap[u.id]?.role ?? null,
    created_at: u.created_at,
  }))

  return c.json({ users })
})

// ── POST /api/v1/users/invite ─────────────────────────────────────────────────
app.post('/invite', async (c) => {
  const result = await getCallerProfile(c)
  if (result.error) return c.json({ error: result.error }, 401)

  const { profile: caller } = result
  if (!['owner', 'manager'].includes(caller.role)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  let body
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const { email, role, full_name } = body
  if (!email || !role) return c.json({ error: 'email and role are required' }, 400)
  if (!VALID_ROLES.includes(role)) {
    return c.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, 400)
  }

  const { data, error } = await getSupabase(c.env).auth.admin.inviteUserByEmail(email, {
    data: { role, full_name: full_name?.trim() || null },
  })

  if (error) return c.json({ error: error.message }, 400)

  return c.json({ user: { id: data.user.id, email: data.user.email, role } })
})

// ── PATCH /api/v1/users/:id/role ─────────────────────────────────────────────
app.patch('/:id/role', async (c) => {
  const result = await getCallerProfile(c)
  if (result.error) return c.json({ error: result.error }, 401)

  const { profile: caller } = result
  if (!['owner', 'manager'].includes(caller.role)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const targetId = c.req.param('id')
  if (targetId === caller.id) {
    return c.json({ error: 'You cannot change your own role' }, 400)
  }

  let body
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const { role } = body
  if (!role) return c.json({ error: 'role is required' }, 400)
  if (!VALID_ROLES.includes(role)) {
    return c.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, 400)
  }

  const supabase = getSupabase(c.env)

  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', targetId)
    .single()

  if (target?.role === 'owner') {
    return c.json({ error: 'Cannot change the role of an owner' }, 403)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', targetId)

  if (error) return c.json({ error: error.message }, 500)

  return c.json({ success: true })
})

export default app
