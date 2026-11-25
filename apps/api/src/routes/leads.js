import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { escHtml, isValidEmail } from '../lib/emailUtils.js'

// Owner-only employer lead actions that need the service role:
//   POST /:id/send-email   one vetted first-contact or follow-up email
//   POST /:id/convert      turn a lead into a row in public.employers
//
// There is deliberately no bulk endpoint. One request sends one email to one
// lead the owner has researched and vetted.

const app = new Hono()

const MAX_EMAILS_PER_DAY  = 20   // across all leads, rolling 24h; override with LEADS_DAILY_EMAIL_LIMIT
const MAX_EMAILS_PER_LEAD = 3    // first contact plus two follow-ups
const SUBJECT_MAX = 150
const BODY_MAX    = 5000
const FOLLOW_UP_DAYS = 7
const SENDER_ADDRESS = 'partnerships@bhuiyanworkforce.com'

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
const OPT_OUT_LINE_EL =
  'Αν προτιμάτε να μην λαμβάνετε άλλα μηνύματα από εμάς, απαντήστε «όχι ευχαριστώ» και δεν θα σας γράψουμε ξανά.'
const GREEK_RE = /[\u0370-\u03FF\u1F00-\u1FFF]/

// ── Zoho Mail sender ──────────────────────────────────────────────────────────
// Sends through the Zoho Mail REST API as partnerships@bhuiyanworkforce.com, so
// every email lands in that mailbox's Sent folder and replies come back to the
// same inbox. Needs these Worker secrets/vars (see wrangler.toml):
//   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_DC (default "com"),
//   ZOHO_ACCOUNT_ID (optional, looked up automatically when missing)
const ZOHO_DCS = ['com', 'eu', 'in', 'com.au', 'jp', 'ca', 'sa', 'com.cn']

let zohoToken = { value: null, exp: 0 }
let zohoAccountId = null

function zohoHosts(env) {
  const dc = ZOHO_DCS.includes(env.ZOHO_DC) ? env.ZOHO_DC : 'com'
  return { accounts: `https://accounts.zoho.${dc}`, mail: `https://mail.zoho.${dc}` }
}

function zohoConfigured(env) {
  return !!(env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET && env.ZOHO_REFRESH_TOKEN)
}

async function getZohoToken(env, force = false) {
  if (!force && zohoToken.value && Date.now() < zohoToken.exp) return zohoToken.value
  const res = await fetch(`${zohoHosts(env).accounts}/oauth/v2/token`, {
    method: 'POST',
    body: new URLSearchParams({
      refresh_token: env.ZOHO_REFRESH_TOKEN,
      client_id: env.ZOHO_CLIENT_ID,
      client_secret: env.ZOHO_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })
  let data = {}
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok || !data.access_token) {
    throw new Error(`Zoho sign-in failed${data?.error ? `: ${data.error}` : ''}`)
  }
  zohoToken = {
    value: data.access_token,
    exp: Date.now() + ((Number(data.expires_in) || 3600) - 120) * 1000,
  }
  return zohoToken.value
}

async function getZohoAccountId(env, token) {
  if (env.ZOHO_ACCOUNT_ID) return String(env.ZOHO_ACCOUNT_ID)
  if (zohoAccountId) return zohoAccountId
  const res = await fetch(`${zohoHosts(env).mail}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: 'application/json' },
  })
  let data = {}
  try { data = await res.json() } catch { /* empty body */ }
  const list = Array.isArray(data?.data) ? data.data : []
  // Prefer the account that owns the sender address, else the first one.
  const match = list.find(a => JSON.stringify(a).toLowerCase().includes(SENDER_ADDRESS)) ?? list[0]
  if (!res.ok || !match?.accountId) {
    throw new Error('Could not find the Zoho Mail account. Set ZOHO_ACCOUNT_ID, or check the ZohoMail.accounts.READ scope.')
  }
  zohoAccountId = String(match.accountId)
  return zohoAccountId
}

async function sendViaZoho(env, { to, subject, html }) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getZohoToken(env, attempt > 0)
    const accountId = await getZohoAccountId(env, token)
    const res = await fetch(`${zohoHosts(env).mail}/api/accounts/${accountId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        fromAddress: SENDER_ADDRESS,
        toAddress: to,
        subject,
        content: html,
        mailFormat: 'html',
      }),
    })
    let data = {}
    try { data = await res.json() } catch { /* empty body */ }
    if (res.status === 401 && attempt === 0) continue   // token went stale, refresh once
    const code = data?.status?.code ?? res.status
    if (!res.ok || code !== 200) {
      throw new Error(data?.data?.errorCode || data?.status?.description || `Zoho rejected the message (${res.status})`)
    }
    return { id: data?.data?.messageId ?? null }
  }
  throw new Error('Zoho rejected the sign-in token')
}

async function zohoGetJson(env, pathAndQuery) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getZohoToken(env, attempt > 0)
    const accountId = await getZohoAccountId(env, token)
    const res = await fetch(`${zohoHosts(env).mail}/api/accounts/${accountId}${pathAndQuery}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: 'application/json' },
    })
    if (res.status === 401 && attempt === 0) continue
    let data = {}
    try { data = await res.json() } catch { /* empty body */ }
    if (res.status === 401 || res.status === 403) {
      throw new Error('Zoho refused to read the mailbox. Create a new refresh token that includes the ZohoMail.messages.READ scope.')
    }
    if (!res.ok) throw new Error(data?.status?.description || `Zoho request failed (${res.status})`)
    return data
  }
  throw new Error('Zoho rejected the sign-in token')
}

// ── Reply detection helpers ───────────────────────────────────────────────────
function normalizeForMatch(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ')
}

const OPT_OUT_RE = new RegExp(
  '\\b(no thanks|no thank you|unsubscribe|remove me|do not (contact|email|write)|don\'?t (contact|email|write)|stop (emailing|writing|contacting))\\b' +
  '|οχι ευχαριστω|οχι ευχαριστουμε|μην (μου |μασ )?(στελνετε|γραφετε|επικοινωνειτε)|διαγραφη|απεγγραφη'
)
const AUTO_REPLY_RE = new RegExp(
  'automatic reply|auto.?reply|out of office|autoreply|undeliverable|delivery status|mail delivery|' +
  'αυτοματη απαντηση|εκτος γραφειου'
)

function looksLikeOptOut(subject, summary) {
  // Our own footer says 'reply "no thanks"'. Remove it so a quoted copy does not count.
  const own = [OPT_OUT_LINE, OPT_OUT_LINE_EL].map(normalizeForMatch)
  let text = normalizeForMatch(`${subject} ${summary}`)
  for (const line of own) text = text.split(line).join(' ')
  return OPT_OUT_RE.test(text)
}

// ── POST /api/v1/leads/check-replies ──────────────────────────────────────────
// Owner taps "Check inbox". Looks at mail received since the first email went
// out, matches senders to lead addresses, logs replies, moves leads to
// "replied" and flags clear opt-outs as do-not-contact. Replies are logged
// whatever the wording; the opt-out match is a best-effort guess on the subject
// and the first lines of the message, so flagged leads should be checked by eye.
app.post('/check-replies', async (c) => {
  const auth = await getOwner(c)
  if (auth.error) return c.json({ error: auth.error }, auth.status)
  if (!zohoConfigured(c.env)) return c.json({ error: 'Zoho Mail is not configured on the server yet' }, 500)

  const supabase = getSupabase(c.env)
  const { data: leads, error: leadsErr } = await supabase
    .from('employer_leads')
    .select('id, contact_email, stage, first_contacted_at, do_not_contact')
    .not('first_contacted_at', 'is', null)
    .not('contact_email', 'is', null)
  if (leadsErr) return c.json({ error: leadsErr.message }, 500)
  if (!leads || leads.length === 0) return c.json({ newReplies: 0, autoReplies: 0, optOuts: 0 })

  const byEmail = new Map(leads.map(l => [l.contact_email.trim().toLowerCase(), l]))
  const oldest = Math.min(...leads.map(l => Date.parse(l.first_contacted_at)))
  const since = Math.max(oldest - 60 * 60 * 1000, Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Pull recent mail, newest pages first, up to 500 messages.
  const messages = []
  try {
    for (let page = 0; page < 5; page++) {
      const start = 1 + page * 100
      const data = await zohoGetJson(
        c.env,
        `/messages/search?searchKey=newMails&receivedTime=${since}&start=${start}&limit=100`
      )
      const batch = Array.isArray(data?.data) ? data.data : []
      messages.push(...batch)
      if (batch.length < 100) break
    }
  } catch (err) {
    console.error('[leads] check-replies read failed:', err?.message ?? err)
    return c.json({ error: err?.message ?? 'Could not read the mailbox' }, 502)
  }

  // Skip messages already logged. The Zoho message id is kept in brackets at the end of the summary.
  const leadIds = leads.map(l => l.id)
  const { data: logged, error: loggedErr } = await supabase
    .from('employer_lead_activities')
    .select('lead_id, summary')
    .in('lead_id', leadIds)
    .in('kind', ['reply', 'note'])
  if (loggedErr) return c.json({ error: loggedErr.message }, 500)
  const seen = new Set()
  for (const row of logged ?? []) {
    const m = /\[(\d+)\]$/.exec(row.summary ?? '')
    if (m) seen.add(`${row.lead_id}|${m[1]}`)
  }

  let newReplies = 0
  let autoReplies = 0
  let optOuts = 0

  for (const m of messages) {
    const from = String(m.fromAddress ?? '').trim().toLowerCase()
    const lead = byEmail.get(from)
    const id = m.messageId != null ? String(m.messageId) : null
    if (!lead || !id) continue
    const received = Number(m.receivedTime ?? m.receivedtime)
    if (Number.isFinite(received) && received < Date.parse(lead.first_contacted_at)) continue
    if (seen.has(`${lead.id}|${id}`)) continue
    seen.add(`${lead.id}|${id}`)

    const subject = String(m.subject ?? '(no subject)').slice(0, 160)
    const summaryText = String(m.summary ?? '')

    if (AUTO_REPLY_RE.test(normalizeForMatch(subject))) {
      await supabase.from('employer_lead_activities').insert({
        lead_id: lead.id, kind: 'note', summary: `Automatic reply, not counted: ${subject} [${id}]`,
      })
      autoReplies += 1
      continue
    }

    await supabase.from('employer_lead_activities').insert({
      lead_id: lead.id, kind: 'reply', summary: `Reply received: ${subject} [${id}]`,
    })
    newReplies += 1

    if (['new', 'researching', 'vetted', 'contacted'].includes(lead.stage)) {
      await supabase.from('employer_leads').update({ stage: 'replied' }).eq('id', lead.id)
      lead.stage = 'replied'
    }

    if (!lead.do_not_contact && looksLikeOptOut(subject, summaryText)) {
      await supabase.from('employer_leads').update({ do_not_contact: true }).eq('id', lead.id)
      await supabase.from('employer_lead_activities').insert({
        lead_id: lead.id, kind: 'note', summary: `Their reply looks like an opt-out, marked do not contact. Please read it. [${id}]`,
      })
      lead.do_not_contact = true
      optOuts += 1
    }
  }

  return c.json({ newReplies, autoReplies, optOuts })
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

  if (!zohoConfigured(c.env)) return c.json({ error: 'Zoho Mail is not configured on the server yet' }, 500)

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
  const dailyLimit = Number(c.env.LEADS_DAILY_EMAIL_LIMIT) || MAX_EMAILS_PER_DAY
  if ((sentToday ?? 0) >= dailyLimit) {
    return c.json({ error: `Daily limit of ${dailyLimit} emails reached. Try again tomorrow.` }, 429)
  }
  if ((sentToLead ?? 0) >= MAX_EMAILS_PER_LEAD) {
    return c.json({ error: `Already sent ${MAX_EMAILS_PER_LEAD} emails to this lead. Pick up the phone or let it rest.` }, 429)
  }

  const fullText = `${text}\n\n${GREEK_RE.test(text) ? OPT_OUT_LINE_EL : OPT_OUT_LINE}`

  let sent
  try {
    sent = await sendViaZoho(c.env, { to: lead.contact_email, subject, html: textToHtml(fullText) })
  } catch (err) {
    console.error('[leads] Zoho send failed:', err?.message ?? err)
    return c.json({ error: err?.message ?? 'Email provider rejected the message' }, 502)
  }

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
    return c.json({ success: true, id: sent.id, warning: 'Email sent, but the activity log did not save' })
  }

  return c.json({ success: true, id: sent.id })
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
