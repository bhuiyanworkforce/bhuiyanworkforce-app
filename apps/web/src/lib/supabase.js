import { createClient } from '@supabase/supabase-js'

const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL
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
// ROOT CAUSE OF INFINITE SPINNER:
//
// The browser's native fetch() has NO timeout. On a slow or flaky mobile
// connection (common in Bangladesh), the TCP handshake succeeds but data
// transfer stalls. The browser keeps the connection open for 60-90 seconds
// before the OS times it out. During this time every Supabase query is stuck
// awaiting a promise that never resolves or rejects — so setLoading(false)
// inside try/catch/finally never runs. The spinner shows forever.
//
// Fix: wrap every fetch with a 12-second AbortController timeout.
// 12 s is generous enough for slow 3G (Supabase queries are small JSON payloads)
// but short enough to show an error instead of a frozen spinner.
//
// This single change fixes ALL pages simultaneously because every Supabase
// query in the app goes through this one fetch function.
// ──────────────────────────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 12_000

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()

  const timer = setTimeout(() => {
    controller.abort()
    console.warn('[supabase] Request timed out:', url)
  }, FETCH_TIMEOUT_MS)

  // Merge our signal with any signal the caller already provided
  const existingSignal = options.signal
  if (existingSignal) {
    // If the caller already has a signal, abort ours when theirs aborts too
    existingSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

export const supabase = createClient(
  supabaseUrl   ?? 'http://localhost',
  supabaseAnonKey ?? 'missing-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession:   true,
      detectSessionInUrl: true,
    },
    global: {
      // Supabase JS v2 passes every request through this fetch function.
      // Replacing it with fetchWithTimeout adds a hard timeout to ALL queries:
      // PostgREST data fetches, auth calls, storage uploads, realtime handshakes.
      fetch: fetchWithTimeout,
    },
  }
)
