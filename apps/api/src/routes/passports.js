import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

const app = new Hono()

function getSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
}

function isAuthorized(c) {
  return c.req.header('Authorization') === `Bearer ${c.env.INTERNAL_SECRET}`
}

async function sendEmail(env, { to, subject, html }) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'AgencyOS <noreply@bhuiyanworkforce.com>', to: [to], subject, html }),
  })
}

app.post('/status-update', async (c) => {
  if (!isAuthorized(c)) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const { passport_id, new_status, note, user_id } = await c.req.json()
    const supabase = getSupabase(c.env)

    const { data: passport } = await supabase.from('passports')
      .select('passport_no, status, candidates(full_name, phone, agents(full_name, email))')
      .eq('id', passport_id).single()

    if (!passport) return c.json({ error: 'Passport not found' }, 404)

    const candidate = passport.candidates
    const agent = candidate?.agents

    await supabase.from('passports').update({ status: new_status }).eq('id', passport_id)
    await supabase.from('passport_workflow_logs').insert({
      passport_id, from_status: passport.status, to_status: new_status,
      note: note || null, changed_by: user_id,
    })

    if (agent?.email) {
      const statusLabel = new_status.replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
      await sendEmail(c.env, {
        to: agent.email,
        subject: `Passport Update — ${candidate.full_name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
            <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:16px;padding:24px;margin-bottom:24px;">
              <h1 style="color:white;font-size:24px;font-weight:900;margin:0;">AgencyOS</h1>
              <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;">Bhuiyan Workforce Management</p>
            </div>
            <h2 style="font-size:20px;color:#1a1a2e;margin-bottom:8px;">Passport Status Updated</h2>
            <p style="color:#666;margin-bottom:24px;">Dear ${agent.full_name},</p>
            <div style="background:#f8f9ff;border-radius:12px;padding:20px;margin-bottom:24px;border-left:4px solid #6366f1;">
              <p style="margin:0 0 8px;"><strong>Candidate:</strong> ${candidate.full_name}</p>
              <p style="margin:0 0 8px;"><strong>Passport No:</strong> ${passport.passport_no}</p>
              <p style="margin:0 0 8px;"><strong>New Status:</strong> <span style="color:#6366f1;font-weight:700;">${statusLabel}</span></p>
              ${note ? `<p style="margin:8px 0 0;"><strong>Note:</strong> ${note}</p>` : ''}
            </div>
            <p style="color:#666;font-size:14px;">Log in to AgencyOS to view full details.</p>
            <a href="https://app.bhuiyanworkforce.com" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;margin-top:16px;">Open AgencyOS</a>
            <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">Bhuiyan Workforce Management · bhuiyanworkforce.com</p>
          </div>`,
      })
    }

    await supabase.from('notifications').insert({
      user_id, title: 'Passport Updated',
      message: `${candidate.full_name}'s passport moved to ${new_status.replaceAll('_', ' ')}`,
      type: 'info',
    })

    return c.json({ success: true })
  } catch (err) {
    return c.json({ error: err.message }, 500)
  }
})

export default app
