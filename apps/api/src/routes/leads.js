import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { escHtml, isValidEmail } from '../lib/emailUtils.js'

// Owner-only employer lead actions that need the service role:
//   POST /:id/send-email   one vetted first-contact or follow-up email
//   POST /:id/convert      turn a lead into a row in public.employers
//   POST /inbound          optional Resend email.received webhook (Svix-signed);
//                          logs a reply and moves the lead to "replied"
//
// There is deliberately no bulk endpoint. One request sends one email to one
// lead the owner has researched and vetted.

const app = new Hono()

const MAX_EMAILS_PER_DAY  = 30   // across all leads, rolling 24h
const MAX_EMAILS_PER_LEAD = 3    // first contact plus two follow-ups
const SUBJECT_MAX = 150
const BODY_MAX    = 5000
const FOLLOW_UP_DAYS = 7
const SENDER = 'Bhuiyan Workforce <partnerships@bhuiyanworkforce.com>'
const DEFAULT_REPLY_TO = 'partnerships@bhuiyanworkforce.com'

app.onError((err, c) => {
  console.error('[leads] Unhandled error:', err?.message ?? err)
  return c.json({ error: err?.message ?? 'Internal server error' }, 500)
})

function getSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
}

async function getOwner(c) {
  const authHeader = c.req.header('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return { status: 401, error: 'Missing token' }

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_ANON_KEY || !c.env.SUPABASE_SERVICE_KEY) {
    return { status: 500, error: 'Server is missing Supabase configuration' }
  }

  const { data: userData, error: authErr } = await createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ).auth.getUser()

  const user = userData?.user
  if (authErr || !user) return { status: 401, error: 'Invalid session' }

  const { data: profile, error: profileErr } = await getSupabase(c.env)
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile) return { status: 401, error: 'Profile not found' }
  if (profile.role !== 'owner') return { status: 403, error: 'Forbidden' }

  return { profile }
}

// Plain-text body -> safe HTML. Paragraphs split on blank lines, single
// newlines become <br>. Everything is escaped first, so no markup gets through.
function textToHtml(text) {
  return String(text)
    .split(/\n{2,}/)
    .map(p => `<p style="font-family:Arial,sans-serif;font-size:14px;color:#222;margin:0 0 14px;">${escHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

const OPT_OUT_LINE =
  'If you would rather not hear from us, reply with "no thanks" and we will not write again.'

// ── Svix signature check (Resend webhooks) ────────────────────────────────────
function safeEqual(a, b) {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

function b64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function verifySvix(secret, headers, payload) {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const sigHeader = headers.get('svix-signature')
  if (!id || !timestamp || !sigHeader) return false

  // Reject anything older (or newer) than five minutes.
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false

  let key
  try {
    const raw = b64ToBytes(secret.startsWith('whsec_') ? secret.slice(6) : secret)
    key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  } catch { return false }

  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  // Header looks like "v1,<sig> v1,<sig2>"
  return sigHeader.split(' ').some(part => {
    const [version, sig] = part.split(',')
    return version === 'v1' && !!sig && safeEqual(sig, expected)
  })
}

function extractAddress(from) {
  const s = String(from ?? '').trim()
  const lt = s.lastIndexOf('<')
  const gt = s.lastIndexOf('>')
  const addr = lt !== -1 && gt > lt ? s.slice(lt + 1, gt) : s
  return addr.trim().toLowerCase()
}

// ── POST /api/v1/leads/inbound ────────────────────────────────────────────────
// Off unless RESEND_WEBHOOK_SECRET is set. Authenticated by the Svix signature,
// not by a user session. Always answers 200 for valid events so Resend does not
// retry, even when the sender matches no lead.
app.post('/inbound', async (c) => {
  const secret = c.env.RESEND_WEBHOOK_SECRET
  if (!secret) return c.json({ error: 'Not found' }, 404)

  const payload = await c.req.text()
  if (!(await verifySvix(secret, c.req.raw.headers, payload))) {
    return c.json({ error: 'Invalid signature' }, 400)
  }

  let event
  try { event = JSON.parse(payload) } catch { return c.json({ error: 'Invalid JSON' }, 400) }
  if (event?.type !== 'email.received') return c.json({ ok: true })

  const addr = extractAddress(event.data?.from)
  if (!addr || !isValidEmail(addr)) return c.json({ ok: true })

  const supabase = getSupabase(c.env)
  const escaped = addr.replace(/[\\%_]/g, m => `\\${m}`)
  const { data: lead } = await supabase
    .from('employer_leads')
    .select('id, stage')
    .ilike('contact_email', escaped)
    .limit(1)
    .maybeSingle()
  if (!lead) return c.json({ ok: true })

  const subject = String(event.data?.subject ?? '(no subject)').slice(0, 200)
  const summary = `Reply received: ${subject} [${event.data?.email_id ?? 'no id'}]`

  // Resend delivers at least once, so skip a reply we already logged.
  const { data: dup } = await supabase
    .from('employer_lead_activities')
    .select('id').eq('lead_id', lead.id).eq('summary', summary).limit(1).maybeSingle()
  if (dup) return c.json({ ok: true })

  await supabase.from('employer_lead_activities').insert({ lead_id: lead.id, kind: 'reply', summary })
  if (['new', 'researching', 'vetted', 'contacted'].includes(lead.stage)) {
    await supabase.from('employer_leads').update({ stage: 'replied' }).eq('id', lead.id)
  }
  return c.json({ ok: true })
})

// ── POST /api/v1/leads/:id/send-email ─────────────────────────────────────────
app.post('/:id/send-email', async (c) => {
  const auth = await getOwner(c)
  if (auth.error) return c.json({ error: auth.error }, auth.status)

  let body
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const subject = String(body?.subject ?? '').trim()
  const text    = String(body?.body ?? '').trim()
  if (!subject || !text) return c.json({ error: 'Subject and body are required' }, 400)
  if (subject.length > SUBJECT_MAX) return c.json({ error: `Subject is over ${SUBJECT_MAX} characters` }, 400)
  if (text.length > BODY_MAX) return c.json({ error: `Body is over ${BODY_MAX} characters` }, 400)
  if (/[\r\n]/.test(subject)) return c.json({ error: 'Subject must be a single line' }, 400)

  if (!c.env.RESEND_API_KEY) return c.json({ error: 'RESEND_API_KEY is not set' }, 500)

  const supabase = getSupabase(c.env)
  const leadId = c.req.param('id')

  const { data: lead, error: leadErr } = await supabase
    .from('employer_leads')
    .select('id, company_name, contact_email, stage, vetting_status, registry_checked, address_type, do_not_contact, first_contacted_at')
    .eq('id', leadId)
    .maybeSingle()

  if (leadErr) return c.json({ error: leadErr.message }, 500)
  if (!lead) return c.json({ error: 'Lead not found' }, 404)

  if (lead.do_not_contact)              return c.json({ error: 'This lead is marked do not contact' }, 409)
  if (lead.vetting_status !== 'passed') return c.json({ error: 'Vetting must be marked passed before emailing' }, 409)
  if (!lead.registry_checked) return c.json({ error: 'Tick "found in the official company registry" before emailing' }, 409)
  if (lead.address_type !== 'commercial') return c.json({ error: 'Address type must be commercial before emailing' }, 409)
  if (!lead.contact_email || !isValidEmail(lead.contact_email)) {
    return c.json({ error: 'This lead has no valid contact email' }, 400)
  }

  // Caps. Both are counted from the activity log so they survive restarts.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [{ count: sentToday, error: dayErr }, { count: sentToLead, error: leadCountErr }] = await Promise.all([
    supabase.from('employer_lead_activities')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'email_sent').gte('created_at', since),
    supabase.from('employer_lead_activities')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'email_sent').eq('lead_id', lead.id),
  ])
  if (dayErr || leadCountErr) return c.json({ error: 'Could not check send limits' }, 500)
  if ((sentToday ?? 0) >= MAX_EMAILS_PER_DAY) {
    return c.json({ error: `Daily limit of ${MAX_EMAILS_PER_DAY} emails reached. Try again tomorrow.` }, 429)
  }
  if ((sentToLead ?? 0) >= MAX_EMAILS_PER_LEAD) {
    return c.json({ error: `Already sent ${MAX_EMAILS_PER_LEAD} emails to this lead. Pick up the phone or let it rest.` }, 429)
  }

  const fullText = `${text}\n\n${OPT_OUT_LINE}`
  const replyTo = c.env.REPLY_TO_EMAIL || DEFAULT_REPLY_TO

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: SENDER,
      reply_to: replyTo,
      to: [lead.contact_email],
      subject,
      html: textToHtml(fullText),
      text: fullText,
    }),
  })

  let resData = {}
  try { resData = await res.json() } catch { /* empty body */ }
  if (!res.ok) return c.json({ error: resData?.message ?? 'Email provider rejected the message' }, 502)

  const now = new Date().toISOString()
  const advance = ['new', 'researching', 'vetted'].includes(lead.stage)
  const followUp = new Date(Date.now() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const setFollowUp = !['won', 'lost'].includes(lead.stage)

  const { error: actErr } = await supabase.from('employer_lead_activities').insert({
    lead_id: lead.id,
    kind: 'email_sent',
    summary: `Email sent: ${subject}`,
    created_by: auth.profile.id,
  })

  const { error: updErr } = await supabase.from('employer_leads').update({
    last_contacted_at: now,
    first_contacted_at: lead.first_contacted_at ?? now,
    ...(advance ? { stage: 'contacted' } : {}),
    ...(setFollowUp ? { next_follow_up: followUp } : {}),
  }).eq('id', lead.id)

  // The email already went out, so a logging failure is reported but not fatal.
  if (actErr || updErr) {
    console.error('[leads] sent but failed to log:', actErr?.message, updErr?.message)
    return c.json({ success: true, id: resData.id, warning: 'Email sent, but the activity log did not save' })
  }

  return c.json({ success: true, id: resData.id })
})

// ── POST /api/v1/leads/:id/convert ────────────────────────────────────────────
app.post('/:id/convert', async (c) => {
  const auth = await getOwner(c)
  if (auth.error) return c.json({ error: auth.error }, auth.status)

  const supabase = getSupabase(c.env)
  const leadId = c.req.param('id')

  const { data: lead, error: leadErr } = await supabase
    .from('employer_leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle()

  if (leadErr) return c.json({ error: leadErr.message }, 500)
  if (!lead) return c.json({ error: 'Lead not found' }, 404)
  if (lead.converted_employer_id) return c.json({ error: 'Lead was already converted' }, 409)
  if (lead.vetting_status !== 'passed') return c.json({ error: 'Vetting must be marked passed first' }, 409)
  if (!['replied', 'negotiating', 'won'].includes(lead.stage)) {
    return c.json({ error: 'Only leads that have replied can be converted' }, 409)
  }

  const noteParts = [
    lead.roles_needed ? `Roles needed: ${lead.roles_needed}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.source_url ? `Source: ${lead.source_url}` : null,
    lead.notes || null,
  ].filter(Boolean)

  const { data: employer, error: insErr } = await supabase
    .from('employers')
    .insert({
      company_name: lead.company_name,
      country: lead.country,
      industry: lead.industry,
      contact_name: lead.contact_name,
      contact_phone: lead.contact_phone,
      contact_email: lead.contact_email,
      contract_status: lead.stage === 'negotiating' ? 'negotiating' : 'prospect',
      notes: noteParts.length ? noteParts.join('\n') : null,
      created_by: auth.profile.id,
    })
    .select('id')
    .single()

  if (insErr || !employer) return c.json({ error: insErr?.message ?? 'Could not create employer' }, 500)

  const { error: updErr } = await supabase
    .from('employer_leads')
    .update({ converted_employer_id: employer.id })
    .eq('id', lead.id)
  if (updErr) return c.json({ error: `Employer created, but the lead was not linked: ${updErr.message}` }, 500)

  await supabase.from('employer_lead_activities').insert({
    lead_id: lead.id,
    kind: 'converted',
    summary: 'Converted to employer',
    created_by: auth.profile.id,
  })

  return c.json({ success: true, employer_id: employer.id })
})

export default app
