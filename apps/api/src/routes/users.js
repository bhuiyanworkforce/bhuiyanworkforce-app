import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

const app = new Hono()

const VALID_ROLES = ['manager', 'agent', 'assistant']

// Hierarchy: owner > manager > (agent, assistant, client).
// - An owner can create/change/delete anyone except other owners.
// - A manager can only create, change and delete accounts BELOW manager level,
//   and can only assign roles below manager. Managers can never touch other
//   managers or owners, and can never promote anyone to manager.
const MANAGER_ASSIGNABLE_ROLES = ['agent', 'assistant']
const MANAGER_MANAGEABLE_ROLES = ['agent', 'assistant', 'client']

function canAssignRole(callerRole, role) {
  if (callerRole === 'owner') return VALID_ROLES.includes(role)
  return MANAGER_ASSIGNABLE_ROLES.includes(role)
}

function canManageTarget(callerRole, targetRole) {
  if (targetRole === 'owner') return false
  if (callerRole === 'owner') return true
  return MANAGER_MANAGEABLE_ROLES.includes(targetRole)
}

app.onError((err, c) => {
  console.error('[users] Unhandled error:', err?.message ?? err)
  return c.json({ error: 'Internal server error' }, 500)
})

function getSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
}

async function getCallerProfile(c) {
  const authHeader = c.req.header('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return { error: 'Unauthorized' }

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_ANON_KEY || !c.env.SUPABASE_SERVICE_KEY) {
    console.error('[users] Missing Supabase environment configuration')
    return { error: 'Unauthorized' }
  }

  const { data: { user }, error: authErr } = await createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ).auth.getUser()

  if (authErr || !user) {
    console.error('[users] Auth failed:', authErr?.message ?? 'no user')
    return { error: 'Unauthorized' }
  }

  const { data: profile, error: profileErr } = await getSupabase(c.env)
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile) {
    console.error('[users] Profile fetch failed:', profileErr?.message ?? 'not found')
    return { error: 'Unauthorized' }
  }

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

  const { data: authData, error: authErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (authErr) {
    console.error('[users] listUsers failed:', authErr.message)
    return c.json({ error: 'Could not load users' }, 500)
  }

  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, full_name, role')
  if (profileErr) {
    console.error('[users] profiles fetch failed:', profileErr.message)
    return c.json({ error: 'Could not load users' }, 500)
  }

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

// ── POST /api/v1/users ────────────────────────────────────────────────────────
// Creates a user with email + password + role (no invite email needed)
app.post('/', async (c) => {
  const result = await getCallerProfile(c)
  if (result.error) return c.json({ error: result.error }, 401)

  const { profile: caller } = result
  if (!['owner', 'manager'].includes(caller.role)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  let body
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const { email, password, role, full_name } = body
  if (!email || !password || !role) {
    return c.json({ error: 'email, password and role are required' }, 400)
  }
  if (password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400)
  }
  if (!VALID_ROLES.includes(role)) {
    return c.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, 400)
  }
  if (!canAssignRole(caller.role, role)) {
    return c.json({ error: 'Only the owner can create manager accounts' }, 403)
  }

  const supabase = getSupabase(c.env)

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm so they can log in immediately
    // FIX: role goes in app_metadata — only the service role can write it.
    // user_metadata is client-editable, so it must never carry privileges.
    app_metadata: { role },
    user_metadata: {
      full_name: full_name?.trim() || null,
    },
  })

  if (error) {
    console.error('[users] createUser failed:', error.message)
    return c.json({ error: 'Could not create user. The email may already be registered.' }, 400)
  }

  // Write the profile role explicitly instead of relying on the database
  // trigger alone. If the live handle_new_user() differs from the repo (it
  // already did once), a new user silently became 'client' even though the
  // API reported the role the owner picked. The service role is allowed to set
  // roles; browser sessions are blocked by trg_prevent_role_self_change.
  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert(
      { id: data.user.id, full_name: full_name?.trim() || data.user.email, role },
      { onConflict: 'id' },
    )

  if (profileErr) {
    console.error('[users] profile role write failed:', profileErr.message)
    // Don't leave a half-created account behind (it would be a 'client').
    await supabase.auth.admin.deleteUser(data.user.id)
    return c.json({ error: 'Could not set up the user profile. Nothing was created.' }, 500)
  }

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
    .maybeSingle()

  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.role === 'owner') {
    return c.json({ error: 'Cannot change the role of an owner' }, 403)
  }
  if (!canManageTarget(caller.role, target.role)) {
    return c.json({ error: 'Only the owner can change a manager\'s role' }, 403)
  }
  if (!canAssignRole(caller.role, role)) {
    return c.json({ error: 'Only the owner can assign the manager role' }, 403)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', targetId)

  if (error) {
    console.error('[users] role update failed:', error.message)
    return c.json({ error: 'Could not update role' }, 500)
  }

  return c.json({ success: true })
})

// ── DELETE /api/v1/users/:id ──────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const result = await getCallerProfile(c)
  if (result.error) return c.json({ error: result.error }, 401)

  const { profile: caller } = result
  if (!['owner', 'manager'].includes(caller.role)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const targetId = c.req.param('id')

  if (targetId === caller.id) {
    return c.json({ error: 'You cannot delete yourself' }, 400)
  }

  const supabase = getSupabase(c.env)

  // Prevent deleting an owner
  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', targetId)
    .maybeSingle()

  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.role === 'owner') {
    return c.json({ error: 'Cannot delete an owner account' }, 403)
  }
  if (!canManageTarget(caller.role, target.role)) {
    return c.json({ error: 'Only the owner can delete a manager account' }, 403)
  }

  const { error } = await supabase.auth.admin.deleteUser(targetId)
  if (error) {
    console.error('[users] deleteUser failed:', error.message)
    return c.json({ error: 'Could not delete user' }, 500)
  }

  return c.json({ success: true })
})

export default app
