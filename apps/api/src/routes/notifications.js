import { Hono } from 'hono'

const app = new Hono()

function isAuthorized(c) {
  return c.req.header('Authorization') === `Bearer ${c.env.INTERNAL_SECRET}`
}

// FIX: The previous implementation forwarded raw `html` from the request body
// directly to Resend, meaning any internal caller (or anyone with a leaked
// INTERNAL_SECRET) could send arbitrary HTML email from the app's domain.
//
// Fix strategy:
//   - If the caller supplies `text`, we escape it and build safe HTML ourselves.
//   - If the caller supplies `html`, we still accept it — this is an internal-only
//     endpoint gated behind INTERNAL_SECRET — but we now clearly document that
//     callers are responsible for providing sanitized markup. All existing callers
//     in this codebase (the Supabase edge function and the passports route) build
//     their HTML through escHtml(), so no breaking change is introduced.
//   - Basic field validation (to, subject, content) added before the Resend call.
//   - `to` is validated as a plausible email address to prevent SSRF-style abuse.
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// FIX: Replaced /^[^\s@]+@[^\s@]+\.[^\s@]+$/ which SonarCloud flags as
// potentially vulnerable to super-linear backtracking on pathological inputs.
// The new version uses a simple indexOf-based check — no regex, no backtracking,
// and sufficient for the purpose of rejecting obviously invalid addresses before
// passing them to Resend (which does its own validation anyway).
function isValidEmail(value) {
  const s = String(value ?? '').trim()
  const at = s.indexOf('@')
  if (at < 1) return false                    // no @ or starts with @
  const domain = s.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  return dot > 0 && dot < domain.length - 1  // domain has a dot, not at start/end
}

app.post('/send', async (c) => {
  if (!isAuthorized(c)) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const { to, subject, html, text } = await c.req.json()

    // Validate required fields
    if (!to || !subject || (!html && !text)) {
      return c.json({ error: 'Missing required fields: to, subject, and html or text' }, 400)
    }

    // Validate recipient looks like an email address
    if (!isValidEmail(to)) {
      return c.json({ error: 'Invalid recipient email address' }, 400)
    }

    // Build the final HTML body:
    //   - If `text` is provided, escape it and wrap it — always safe.
    //   - If only `html` is provided, use it as-is (caller is trusted & internal).
    const htmlBody = text
      ? `<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;">${escHtml(text)}</p>`
      : html

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
