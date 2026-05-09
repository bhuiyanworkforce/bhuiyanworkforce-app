import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// FIX: Previously this threw an Error when env vars were missing, which crashed
// the entire module graph before React even mounted — leaving the app frozen on
// a blank screen or an infinite spinner with no explanation.
//
// Now we log clearly and export a null-safe stub so the rest of the app can
// render an informative message instead of silently hanging.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[supabase] Missing environment variables.\n' +
    'Create apps/web/.env with:\n' +
    '  VITE_SUPABASE_URL=https://your-project.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=your-anon-key'
  )
}

export const supabase = createClient(
  supabaseUrl  ?? 'http://localhost',   // safe placeholder — requests will fail gracefully
  supabaseAnonKey ?? 'missing-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
)
