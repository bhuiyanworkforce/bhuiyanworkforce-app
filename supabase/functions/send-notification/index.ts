import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { type, data } = await req.json()
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

  let subject = ''
  let html = ''

  if (type === 'passport_expiring') {
    subject = `⚠️ Passport Expiring Soon - ${data.candidate_name}`
    html = `<p>The passport <strong>${data.passport_no}</strong> for candidate <strong>${data.candidate_name}</strong> expires on <strong>${data.expiry_date}</strong>.</p><p>Please take action immediately.</p>`
  } else if (type === 'invoice_overdue') {
    subject = `🔴 Overdue Invoice - ${data.invoice_no}`
    html = `<p>Invoice <strong>${data.invoice_no}</strong> for <strong>${data.candidate_name}</strong> worth <strong>৳${data.amount}</strong> is overdue since <strong>${data.due_date}</strong>.</p>`
  } else if (type === 'payment_received') {
    subject = `✅ Payment Received - ${data.invoice_no}`
    html = `<p>Payment of <strong>৳${data.amount}</strong> received for invoice <strong>${data.invoice_no}</strong>. Receipt: <strong>${data.receipt_no}</strong>.</p>`
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'AgencyOS <onboarding@resend.dev>',
      to: ['rezaul@bhuiyanworkforce.com'],
      subject,
      html,
    })
  })

  const result = await res.json()
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
})
