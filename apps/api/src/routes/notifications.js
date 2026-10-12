import { Hono } from 'hono'
import { escHtml, isValidEmail } from '../lib/emailUtils.js'

const app = new Hono()

// Constant-time comparison so the secret can't be probed via response timing.
function safeEqual(a, b) {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

// FIX: if INTERNAL_SECRET was ever unset, the old check compared against the
// literal string "Bearer undefined" — anyone sending that header got in.
function isAuthorized(c) {
  const secret = c.env.INTERNAL_SECRET
  if (!secret) return false
  return safeEqual(c.req.header('Authorization') ?? '', `Bearer ${secret}`)
}

// FIX: The previous implementation forwarded raw `html` from the request body
// directly to Resend, meaning any internal caller (or anyone with a leaked
// INTERNAL_SECRET) could send arbitrary HTML email from the app's domain.
//
// Fix strategy:
//   - Only `text` is accepted as content. escHtml() escapes it and we build
//     safe HTML ourselves — the caller can never inject markup.
//   - `html` is no longer accepted. All internal callers (the Supabase edge
//     function and the passports route) already build their own emails directly
//     via sendEmail() in passports.js or via Resend in the edge function, so
//     removing `html` here is not a breaking change for any live caller.
//   - Basic field validation (to, subject, text) added before the Resend call.
//   - `to` is validated as a plausible email address to prevent abuse.
//
// FIX (deduplication): escHtml() and isValidEmail() moved to
// src/lib/emailUtils.js — previously duplicated verbatim in passports.js.

app.post('/send', async (c) => {
  if (!isAuthorized(c)) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const { to, subject, text } = await c.req.json()

    // Validate required fields — only text content accepted (no raw html)
    if (!to || !subject || !text) {
      return c.json({ error: 'Missing required fields: to, subject, text' }, 400)
    }

    // Validate recipient looks like an email address
    if (!isValidEmail(to)) {
      return c.json({ error: 'Invalid recipient email address' }, 400)
    }

    // Always build HTML from escaped text — no raw markup accepted
    const htmlBody = `<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;">${escHtml(text)}</p>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AgencyOS <noreply@bhuiyanworkforce.com>',
        to: [to],
        subject,
        html: htmlBody,
      }),
    })

    const data = await res.json()
    if (!res.ok) return c.json({ error: data.message }, 400)
    return c.json({ success: true, id: data.id })
  } catch (err) {
    return c.json({ error: err.message }, 500)
  }
})

export default app
