import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Auth Context ───────────────────────────────────────────────────────────────
// ROOT CAUSE OF INFINITE SPINNER ON REFRESH:
//
// The previous implementation ran BOTH:
//   1. supabase.auth.getSession()          — explicit hydration call
//   2. onAuthStateChange(INITIAL_SESSION)  — Supabase fires this automatically
//                                            on mount with the stored session
//
// Both paths called fetchProfile(), which called finishLoading() via a
// loadingDone ref guard (only fires once). The race:
//
//   A. INITIAL_SESSION fires first → fetchProfile() → finishLoading() locks
//   B. getSession() resolves → fetchProfile() again → finishLoading() is
//      already locked → DOES NOTHING
//   Result if A's fetchProfile had already consumed the lock: loading stays
//   true if the second fetchProfile is the one that actually gets the data.
//
//   Worse: if INITIAL_SESSION fires and fetchProfile throws, the lock is
//   consumed by the catch block's finishLoading(). Then getSession() calls
//   fetchProfile() again → lock already consumed → loading stays true forever.
//
// FIX: Delete getSession() entirely.
// onAuthStateChange always fires INITIAL_SESSION synchronously on mount with
// whatever session is in storage. It is the single source of truth for the
// initial session state. getSession() is redundant and creates the race.
//
// With only one code path, there is no race, no double-fetch, and no way for
// the loadingDone lock to be consumed before setLoading(false) fires.
// ──────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null)
  const [profile, setProfile]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [authError, setAuthError] = useState(null)

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile row yet (first sign-in race with DB trigger). Fine.
          setProfile(null)
        } else {
          console.error('[Auth] fetchProfile failed:', error)
          setAuthError('Failed to load your profile. Please sign in again.')
          setProfile(null)
        }
      } else {
        setProfile(data)
        setAuthError(null)
      }
    } catch (err) {
      console.error('[Auth] fetchProfile unexpected error:', err)
      setAuthError('An unexpected error occurred. Please sign in again.')
      setProfile(null)
    } finally {
      // Always unblock the app — this is the ONLY place setLoading(false) fires
      // for the initial load, so there is no race condition possible.
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Safety net: unblock after 8 s if Supabase never fires INITIAL_SESSION
    // (e.g. network completely down before the JS bundle even loads).
    const timeout = setTimeout(() => {
      console.warn('[Auth] Loading timed out — unblocking app')
      setLoading(false)
    }, 8000)

    // onAuthStateChange fires INITIAL_SESSION synchronously on mount with the
    // persisted session (or null). This replaces getSession() entirely.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)

        if (session?.user) {
          if (
            _event === 'INITIAL_SESSION' ||
            _event === 'SIGNED_IN'       ||
            _event === 'USER_UPDATED'
          ) {
            // fetchProfile calls setLoading(false) in its finally block.
            // For INITIAL_SESSION this is the first and only path that
            // calls setLoading(false) — no race possible.
            await fetchProfile(session.user.id)
          }
          // TOKEN_REFRESHED: token rotated, session still valid — no reload needed
        } else {
          // Signed out or no session
          setProfile(null)
          setAuthError(null)
          setLoading(false)
        }
      }
    )

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = useCallback(async (email, password) => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    setAuthError(null)
    setLoading(true) // show spinner during sign-out transition
    await supabase.auth.signOut()
    // onAuthStateChange will fire with null session → setLoading(false)
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading, authError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
