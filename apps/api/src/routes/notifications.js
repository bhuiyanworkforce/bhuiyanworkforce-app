import { Hono } from 'hono'

const app = new Hono()

function isAuthorized(c) {
  return c.req.header('Authorization') === `Bearer ${c.env.INTERNAL_SECRET}`
}

app.post('/send', async (c) => {
  if (!isAuthorized(c)) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const { to, subject, html, text } = await c.req.json()
    if (!to || !subject || (!html && !text)) return c.json({ error: 'Missing required fields' }, 400)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${c.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'AgencyOS <noreply@bhuiyanworkforce.com>', to: [to], subject, html: html || `<p>${text}</p>` }),
    })
    const data = await res.json()
    if (!res.ok) return c.json({ error: data.message }, 400)
    return c.json({ success: true, id: data.id })
  } catch (err) {
    return c.json({ error: err.message }, 500)
  }
})

export default app
