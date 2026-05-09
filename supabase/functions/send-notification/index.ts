// Fixes applied:
//   1. Auth check via INTERNAL_SECRET — unauthenticated callers are rejected.
//   2. escHtml() applied to every user-supplied value before interpolation
//      into the HTML email body, preventing XSS in email clients.
//   3. NOTIFY_EMAIL read from env var instead of being hardcoded in source.
//   4. Unknown notification types now return 400 instead of sending a blank email.
//   5. Migrated from deno.land/std@0.168.0 import to native Deno.serve(),
//      which is built into the Supabase edge runtime — no external URL needed.

function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

Deno.serve(async (req) => {
  const headers = { 'Content-Type': 'application/json' }

  // ── Auth check ─────────────────────────────────────────────────────────────
  // Require the same INTERNAL_SECRET used by the Hono API routes so this
  // function can't be triggered by unauthenticated callers.
  const secret = Deno.env.get('INTERNAL_SECRET')
  const auth   = req.headers.get('Authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
  }

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
  // NOTIFY_EMAIL replaces the hardcoded address — set it in the Supabase
  // dashboard under Functions → send-notification → Secrets.
  const NOTIFY_EMAIL  = Deno.env.get('NOTIFY_EMAIL') ?? 'rezaul@bhuiyanworkforce.com'

  let body: { type: string; data: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers })
  }

  const { type, data } = body

  let subject = ''
  let html    = ''

  if (type === 'passport_expiring') {
    subject = `⚠️ Passport Expiring Soon — ${escHtml(data.candidate_name)}`
    html = `
      <p>The passport <strong>${escHtml(data.passport_no)}</strong>
      for candidate <strong>${escHtml(data.candidate_name)}</strong>
      expires on <strong>${escHtml(data.expiry_date)}</strong>.</p>
      <p>Please take action immediately.</p>`

  } else if (type === 'invoice_overdue') {
    subject = `🔴 Overdue Invoice — ${escHtml(data.invoice_no)}`
    html = `
      <p>Invoice <strong>${escHtml(data.invoice_no)}</strong>
      for <strong>${escHtml(data.candidate_name)}</strong>
      worth <strong>৳${escHtml(data.amount)}</strong>
      is overdue since <strong>${escHtml(data.due_date)}</strong>.</p>`

  } else if (type === 'payment_received') {
    subject = `✅ Payment Received — ${escHtml(data.invoice_no)}`
    html = `
      <p>Payment of <strong>৳${escHtml(data.amount)}</strong>
      received for invoice <strong>${escHtml(data.invoice_no)}</strong>.
      Receipt: <strong>${escHtml(data.receipt_no)}</strong>.</p>`

  } else {
    return new Response(
      JSON.stringify({ error: `Unknown notification type: "${type}"` }),
      { status: 400, headers },
    )
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AgencyOS <noreply@bhuiyanworkforce.com>',
      to: [NOTIFY_EMAIL],
      subject,
      html,
    }),
  })

  const result = await res.json()
  return new Response(JSON.stringify(result), {
    status: res.ok ? 200 : res.status,
    headers,
  })
})
