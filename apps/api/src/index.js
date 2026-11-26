import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import notifications from './routes/notifications.js'
import passports from './routes/passports.js'
import users from './routes/users.js'
import leads, { runInboxCheck } from './routes/leads.js'

const app = new Hono()

app.use('*', logger())
app.use('*', cors({
  origin: ['https://app.bhuiyanworkforce.com', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.get('/', (c) => c.json({ status: 'ok', app: 'AgencyOS API', version: '1.0.0' }))
app.get('/api/v1/health', (c) => c.json({ status: 'healthy' }))

app.route('/api/v1/notifications', notifications)
app.route('/api/v1/passports', passports)
app.route('/api/v1/users', users)
app.route('/api/v1/leads', leads)

export default {
  fetch: app.fetch,
  // Runs on the cron schedule in wrangler.toml: logs replies, refusals and bounces without a button tap.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runInboxCheck(env)
        .then(r => console.log('[leads] scheduled inbox check', JSON.stringify(r)))
        .catch(err => console.error('[leads] scheduled inbox check failed:', err?.message ?? err))
    )
  },
}
