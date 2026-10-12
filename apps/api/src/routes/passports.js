import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { escHtml } from '../lib/emailUtils.js'

const app = new Hono()

const VALID_STATUSES = [
  'received', 'interview', 'medical', 'police_clearance', 'bmet',
  'calling_list', 'visa_stamping', 'mofa', 'traveling', 'returned', 'cancelled',
]

// Rate limit: max requests per user per window
const RATE_LIMIT_MAX    = 10
const RATE_LIMIT_WINDOW = 60 // seconds

function getSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
}

async function getAuthUser(c) {
  const authHeader = c.req.header('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return null
  const { data: { user }, error } = await createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ).auth.getUser()
  if (error || !user) return null
  return user
}

// FIX: Rate limit status-update calls per authenticated user using Cloudflare KV.
//
// A compromised or abused token could otherwise spam status updates and trigger
// hundreds of Resend emails in seconds. This middleware limits each user to
// RATE_LIMIT_MAX calls per RATE_LIMIT_WINDOW seconds and returns 429 if exceeded.
//
// The KV store (RATE_LIMIT_KV) must be added to wrangler.toml:
//   [[kv_namespaces]]
//   binding = "RATE_LIMIT_KV"
//   id      = "<your-kv-namespace-id>"
//
// If KV is not configured (e.g. local dev without a namespace), the check is
// skipped so the route still works — with a console warning.
async function checkRateLimit(env, userId) {
  if (!env.RATE_LIMIT_KV) {
    console.warn('[rate-limit] RATE_LIMIT_KV binding not found — skipping rate limit check')
    return { allowed: true }
  }

  const key      = `rl:passport-status:${userId}`
  const existing = await env.RATE_LIMIT_KV.get(key)
  const count    = existing ? parseInt(existing, 10) : 0

  if (count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: RATE_LIMIT_WINDOW }
  }

  // Increment counter; set TTL only on first request so the window is fixed.
  // If we set expirationTtl on every put(), the window resets on each call —
  // meaning a user could make 9 requests every 59 seconds indefinitely.
  await env.RATE_LIMIT_KV.put(key, String(count + 1),
    count === 0 ? { expirationTtl: RATE_LIMIT_WINDOW } : undefined
  )

  return { allowed: true }
}

// FIX: Previously returned the raw Response without checking res.ok, so
// Resend 4xx/5xx errors (invalid recipient, quota exceeded, etc.) were silently
// swallowed — the status update succeeded but the agent never got the email and
// there was no log. Now we check the response and log a warning on failure.
// We don't fail the whole request on email error because the passport update
// itself succeeded and reversing it would be worse than a missed email.
async function sendEmail(env, { to, subject, html }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'AgencyOS <noreply@bhuiyanworkforce.com>', to: [to], subject, html }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)')
      console.error(`[sendEmail] Resend error ${res.status} to ${to}: ${body}`)
    }
  } catch (err) {
    console.error(`[sendEmail] Network error sending to ${to}:`, err?.message ?? err)
  }
}

// Roles allowed to move a passport through the workflow. Sub-agents ('agent')
// and 'client' accounts must never be able to do this.
const STATUS_ROLES = ['owner', 'manager', 'assistant']

app.post('/status-update', async (c) => {
  const user = await getAuthUser(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const token = (c.req.header('Authorization') ?? '').slice(7)
  const supabase = getSupabase(c.env)

  // FIX: this route uses the service key (bypasses RLS) and previously had NO
  // role check — any logged-in account, including a sub-agent, could change
  // any passport's status. Gate on role first.
  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!caller || !STATUS_ROLES.includes(caller.role)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Rate limiting — 10 status updates per user per 60 seconds
  const { allowed, retryAfter } = await checkRateLimit(c.env, user.id)
  if (!allowed) {
    return c.json(
      { error: `Rate limit exceeded. Try again in ${retryAfter} seconds.` },
      429,
      { 'Retry-After': String(retryAfter) }
    )
  }

  try {
    let body
    try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
    const { passport_id, new_status, note } = body

    if (!passport_id || !new_status) {
      return c.json({ error: 'Missing required fields: passport_id, new_status' }, 400)
    }
    if (!VALID_STATUSES.includes(new_status)) {
      return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400)
    }

    // Read + update as the CALLER (anon key + their JWT) so RLS applies:
    // an assistant can only change passports they created, exactly as in the UI.
    const asUser = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: current } = await asUser.from('passports')
      .select('passport_no, status, candidate_id').eq('id', passport_id).maybeSingle()
    if (!current) return c.json({ error: 'Passport not found' }, 404)

    // Update first, then log — so the log only exists if the update succeeded.
    const { data: updated, error: updateError } = await asUser
      .from('passports').update({ status: new_status }).eq('id', passport_id).select('id')

    if (updateError) {
      console.error('[passports] update failed:', updateError.message)
      return c.json({ error: 'Failed to update passport status' }, 500)
    }
    // RLS blocks silently (0 rows, no error) — treat that as forbidden.
    if (!updated || updated.length === 0) {
      return c.json({ error: 'You do not have permission to update this passport' }, 403)
    }

    await supabase.from('passport_workflow_logs').insert({
      passport_id, from_status: current.status, to_status: new_status,
      note: note || null, changed_by: user.id,
    })

    // Look up who to notify with the service client (the caller may not be
    // allowed to read sub_agents contact details).
    // FIX: the relation was renamed agents → sub_agents in migration
    // 20260906000001, but this code still read `candidate.agents`, so the
    // email and bell notification never reached the sub-agent.
    const { data: cand } = await supabase.from('candidates')
      .select('full_name, sub_agents(full_name, email, profile_id)')
      .eq('id', current.candidate_id).maybeSingle()
    const subAgent = cand?.sub_agents
    const candidateName = cand?.full_name ?? 'Unknown candidate'

    if (subAgent?.email) {
      const statusLabel = new_status.replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
      await sendEmail(c.env, {
        to: subAgent.email,
        // Subject is plain text — do NOT HTML-escape it (shows "&amp;" literally).
        subject: `Passport Update — ${candidateName}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
            <h2>Passport Status Updated</h2>
            <p>Dear ${escHtml(subAgent.full_name)},</p>
            <p><strong>Candidate:</strong> ${escHtml(candidateName)}</p>
            <p><strong>Passport No:</strong> ${escHtml(current.passport_no)}</p>
            <p><strong>New Status:</strong> ${escHtml(statusLabel)}</p>
            ${note ? `<p><strong>Note:</strong> ${escHtml(note)}</p>` : ''}
            <a href="https://app.bhuiyanworkforce.com">Open AgencyOS</a>
          </div>`,
      })
    }

    // Bell notification goes to the sub-agent's login if they have one;
    // otherwise fall back to the staff member who made the change.
    await supabase.from('notifications').insert({
      user_id: subAgent?.profile_id ?? user.id,
      title: 'Passport Updated',
      message: `${candidateName}'s passport moved to ${new_status.replaceAll('_', ' ')}`,
      type: 'info',
    })

    return c.json({ success: true })
  } catch (err) {
    console.error('[passports] status-update error:', err?.message ?? err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
