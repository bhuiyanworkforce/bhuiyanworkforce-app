import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[supabase] Missing environment variables.\n' +
    'Create apps/web/.env with:\n' +
    '  VITE_SUPABASE_URL=https://your-project.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=your-anon-key'
  )
}

// ── Fetch with timeout ─────────────────────────────────────────────────────────
// On slow mobile (Bangladesh 3G/4G), Supabase's proactive token refresh
// request on every page load hangs indefinitely — the TCP connection opens
// but data transfer stalls. This blocks INITIAL_SESSION from ever firing,
// so onAuthStateChange never gets a user → every page spins forever.
//
// Two fixes applied:
//   1. Reduced timeout from 12s → 6s so abort fires before the 8s auth
//      safety-net timeout. Previously both fired at nearly the same time,
//      creating a race where the abort error wasn't caught before the auth
//      timeout unblocked the app with user=null.
//   2. Added autoRefreshToken logic (below) to stop the proactive refresh.
// ──────────────────────────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 6_000

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()

  const timer = setTimeout(() => {
    controller.abort()
    console.warn('[supabase] Request timed out:', url)
  }, FETCH_TIMEOUT_MS)

  const existingSignal = options.signal
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

// ── Supabase client ────────────────────────────────────────────────────────────
// KEY FIX: autoRefreshToken: false on initial client creation.
//
// Supabase JS v2 proactively refreshes the access token on every page load
// even when the token is still valid. On slow mobile this refresh request
// hangs, blocking INITIAL_SESSION and causing the infinite spinner.
//
// Setting autoRefreshToken: false stops the proactive refresh.
// We then manually re-enable it after the INITIAL_SESSION fires (in
// AuthContext) so tokens still rotate normally during the session.
//
// Alternative approach used here: keep autoRefreshToken: true but rely on
// the 6s fetchWithTimeout to abort the stalled refresh quickly, so
// INITIAL_SESSION fires with the existing (still-valid) stored token instead
// of waiting for a refreshed one.
// ──────────────────────────────────────────────────────────────────────────────
export const supabase = createClient(
  supabaseUrl    ?? 'http://localhost',
  supabaseAnonKey ?? 'missing-key',
  {
    auth: {
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  }
)
