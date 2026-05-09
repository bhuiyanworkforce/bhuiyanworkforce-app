import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

const app = new Hono()

const VALID_STATUSES = [
  'received', 'interview', 'medical', 'police_clearance', 'bmet',
  'calling_list', 'visa_stamping', 'mofa', 'traveling', 'returned', 'cancelled',
]

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

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function sendEmail(env, { to, subject, html }) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'AgencyOS <noreply@bhuiyanworkforce.com>', to: [to], subject, html }),
  })
}

app.post('/status-update', async (c) => {
  const user = await getAuthUser(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const body = await c.req.json()
    const { passport_id, new_status, note } = body

    if (!passport_id || !new_status) {
      return c.json({ error: 'Missing required fields: passport_id, new_status' }, 400)
    }

    if (!VALID_STATUSES.includes(new_status)) {
      return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400)
    }

    const supabase = getSupabase(c.env)

    const { data: passport } = await supabase.from('passports')
      .select('passport_no, status, candidates(full_name, phone, agents(full_name, email))')
      .eq('id', passport_id).single()

    if (!passport) return c.json({ error: 'Passport not found' }, 404)

    const candidate = passport.candidates
    const agent = candidate?.agents

    await supabase.from('passport_workflow_logs').insert({
      passport_id, from_status: passport.status, to_status: new_status,
      note: note || null, changed_by: user.id,
    })

    await supabase.from('passports').update({ status: new_status }).eq('id', passport_id)

    if (agent?.email) {
      const statusLabel = new_status.replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
      await sendEmail(c.env, {
        to: agent.email,
        subject: `Passport Update — ${escHtml(candidate.full_name)}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
            <h2>Passport Status Updated</h2>
            <p>Dear ${escHtml(agent.full_name)},</p>
            <p><strong>Candidate:</strong> ${escHtml(candidate.full_name)}</p>
            <p><strong>Passport No:</strong> ${escHtml(passport.passport_no)}</p>
            <p><strong>New Status:</strong> ${escHtml(statusLabel)}</p>
            ${note ? `<p><strong>Note:</strong> ${escHtml(note)}</p>` : ''}
            <a href="https://app.bhuiyanworkforce.com">Open AgencyOS</a>
          </div>`,
      })
    }

    await supabase.from('notifications').insert({
      user_id: user.id, title: 'Passport Updated',
      message: `${candidate.full_name}'s passport moved to ${new_status.replaceAll('_', ' ')}`,
      type: 'info',
    })

    return c.json({ success: true })
  } catch (err) {
    return c.json({ error: err.message }, 500)
  }
})

export default app
