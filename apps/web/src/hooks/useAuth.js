import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── BUG 3 FIX ───────────────────────────────────────────────────────────────
// signIn and signOut were defined at module scope, outside the hook.
// Problems this caused:
//   1. They were re-exported from inside useAuth() but defined outside it,
//      meaning they can never trigger React state updates (no access to setUser
//      etc.) — the auth state change listener handles that separately, but it
//      was an inconsistency that made the code fragile.
//   2. signIn was never used anywhere in the app (callers imported useAuth but
//      called the module function directly). Moving both into the hook makes the
//      API surface explicit and consistent: callers destructure from useAuth().
//   3. fetchProfile swallowed errors silently — on a real DB/network failure it
//      would set profile to null with no feedback, causing the app to silently
//      fall back to treating the user as having no role.
//
// Fix:
//   - signIn and signOut defined inside the hook with useCallback so they are
//     stable references (no unnecessary re-renders for consumers).
//   - fetchProfile now returns a boolean success flag and logs clearly.
//   - A new `authError` state is exposed so the Login screen can surface
//     auth failures without managing its own error state.
// ─────────────────────────────────────────────────────────────────────────────

export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  // ── fetchProfile ────────────────────────────────────────────────────────────
  // Returns true on success so callers can branch if needed.
  // Surfaces errors via authError state instead of silently swallowing them.
  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        // PGRST116 = "no rows returned" — profile simply doesn't exist yet
        // (e.g. during first sign-in before a trigger creates it). Not a crash.
        if (error.code === 'PGRST116') {
          setProfile(null)
          return true
        }
        // Any other error (network, RLS, etc.) — surface it
        console.error('fetchProfile failed:', error)
        setAuthError('Failed to load your profile. Please sign in again.')
        setProfile(null)
        return false
      }

      setProfile(data)
      setAuthError(null)
      return true
    } catch (err) {
      console.error('fetchProfile unexpected error:', err)
      setAuthError('An unexpected error occurred. Please sign in again.')
      setProfile(null)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Auth state listener ─────────────────────────────────────────────────────
  useEffect(() => {
    // Hydrate from existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for sign-in / sign-out / token-refresh events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
          setAuthError(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  // ── signIn ──────────────────────────────────────────────────────────────────
  // Defined inside the hook so it has access to setAuthError.
  // Returns { error } so callers can react to failures.
  const signIn = useCallback(async (email, password) => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message)
    }
    return { error }
  }, [])

  // ── signOut ─────────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    setAuthError(null)
    await supabase.auth.signOut()
    // onAuthStateChange fires immediately and clears user/profile above
  }, [])

  return { user, profile, loading, authError, signIn, signOut }
}
