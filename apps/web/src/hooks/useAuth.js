import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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
      // Always unblock the app — this is the single source of truth for
      // transitioning out of the initial loading state.
      setLoading(false)
    }
  }, [])

  // ── Auth state listener ─────────────────────────────────────────────────────
  useEffect(() => {
    // FIX 1: getSession() previously had no .catch(). If Supabase was
    // unreachable (network error, bad env vars, cold-start timeout), the
    // promise rejected, .then() never ran, setLoading(false) was never called,
    // and the app was frozen on the spinner indefinitely.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          // fetchProfile calls setLoading(false) in its finally block
          fetchProfile(session.user.id)
        } else {
          setLoading(false)
        }
      })
      .catch((err) => {
        // Network failure, invalid env vars, or Supabase outage.
        // Log it and unblock the app so the user sees something actionable.
        console.error('[useAuth] getSession failed:', err)
        setAuthError('Unable to reach the server. Check your connection.')
        setLoading(false)
      })

    // FIX 2: Previously only SIGNED_IN and USER_UPDATED triggered fetchProfile.
    // Supabase v2 fires INITIAL_SESSION (not SIGNED_IN) when restoring a
    // persisted session on page load. If getSession() above succeeded and set
    // loading=false that's fine, but if it raced or failed, INITIAL_SESSION
    // was silently dropped and loading stayed true.
    //
    // Adding INITIAL_SESSION here means a persisted session is always handled
    // correctly regardless of the getSession() race outcome.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)

        if (session?.user) {
          if (
            _event === 'INITIAL_SESSION' ||
            _event === 'SIGNED_IN' ||
            _event === 'USER_UPDATED'
          ) {
            await fetchProfile(session.user.id)
          }
          // TOKEN_REFRESHED fires every ~60 min — skip the profile round-trip
        } else {
          // Signed out or session expired
          setProfile(null)
          setAuthError(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  // ── signIn ──────────────────────────────────────────────────────────────────
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
    // onAuthStateChange fires immediately and clears user/profile/loading above
  }, [])

  return { user, profile, loading, authError, signIn, signOut }
}
