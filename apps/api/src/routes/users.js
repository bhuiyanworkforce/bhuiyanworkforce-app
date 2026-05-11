import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

const app = new Hono()

const VALID_ROLES = ['manager', 'agent', 'assistant']

function getSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
}

// Verify the caller is an authenticated owner or manager
async function getCallerProfile(c) {
  const authHeader = c.req.header('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return null

  const supabase = getSupabase(c.env)

  // Verify the JWT and get the user
  const { data: { user }, error } = await createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ).auth.getUser()

  if (error || !user) return null

  // Fetch their profile to check role
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  return profile
}

// ── GET /api/v1/users ─────────────────────────────────────────────────────────
// Returns all profiles joined with auth emails. Owner/manager only.
app.get('/', async (c) => {
  const caller = await getCallerProfile(c)
  if (!caller) return c.json({ error: 'Unauthorized' }, 401)
  if (!['owner', 'manager'].includes(caller.role)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const supabase = getSupabase(c.env)

  // List all auth users (includes email)
  const { data: authData, error: authErr } = await supabase.auth.admin.listUsers()
  if (authErr) return c.json({ error: authErr.message }, 500)

  // List all profiles
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, full_name, role')
  if (profileErr) return c.json({ error: profileErr.message }, 500)

  // Merge by id
  const profileMap = {}
  for (const p of profiles ?? []) profileMap[p.id] = p

  const users = (authData?.users ?? []).map(u => ({
    id:        u.id,
    email:     u.email,
    full_name: profileMap[u.id]?.full_name ?? null,
    role:      profileMap[u.id]?.role ?? null,
    created_at: u.created_at,
  }))

  return c.json({ users })
})

// ── POST /api/v1/users/invite ─────────────────────────────────────────────────
// Invites a new user by email and assigns a role. Owner/manager only.
app.post('/invite', async (c) => {
  const caller = await getCallerProfile(c)
  if (!caller) return c.json({ error: 'Unauthorized' }, 401)
  if (!['owner', 'manager'].includes(caller.role)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  let body
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const { email, role, full_name } = body

  if (!email || !role) return c.json({ error: 'email and role are required' }, 400)
  if (!VALID_ROLES.includes(role)) {
    return c.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, 400)
  }

  const supabase = getSupabase(c.env)

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: {
      role,
      full_name: full_name?.trim() || null,
    },
  })

  if (error) return c.json({ error: error.message }, 400)

  return c.json({ user: { id: data.user.id, email: data.user.email, role } })
})

// ── PATCH /api/v1/users/:id/role ─────────────────────────────────────────────
// Updates an existing user's role. Owner/manager only.
app.patch('/:id/role', async (c) => {
  const caller = await getCallerProfile(c)
  if (!caller) return c.json({ error: 'Unauthorized' }, 401)
  if (!['owner', 'manager'].includes(caller.role)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const targetId = c.req.param('id')

  // Prevent demoting yourself
  if (targetId === caller.id) {
    return c.json({ error: 'You cannot change your own role' }, 400)
  }

  let body
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const { role } = body
  if (!role) return c.json({ error: 'role is required' }, 400)
  if (!VALID_ROLES.includes(role)) {
    return c.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, 400)
  }

  const supabase = getSupabase(c.env)

  // Prevent changing an owner's role
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
