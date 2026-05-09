import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ── Auth Context ───────────────────────────────────────────────────────────────
// ROOT CAUSE FIX: Previously useAuth() was a plain hook with no shared state.
// Every component that called useAuth() (ProtectedRoute, AppLayout, Login,
// Profile) created its OWN independent Supabase listener and its own loading
// state. This meant multiple redundant getSession() calls and onAuthStateChange
// subscriptions on every render cycle.
//
// More critically: each instance started with loading=true. If the instance
// inside ProtectedRoute resolved but then the component subtree re-mounted
// (e.g. during Suspense chunk loading), a fresh instance would start over
// with loading=true again — causing the infinite spinner.
//
// Fix: a single AuthProvider at the root holds all auth state. Every useAuth()
// call reads from the same context — one listener, one loading state, shared
// everywhere.
// ──────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [profile, setProfile]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [authError, setAuthError] = useState(null)
  const loadingDone = useRef(false)

  const finishLoading = useCallback(() => {
    if (!loadingDone.current) {
      loadingDone.current = true
      setLoading(false)
    }
  }, [])

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile row yet — not an error, just means the trigger
          // hasn't created it yet (first sign-in race). App still works.
          setProfile(null)
        } else {
          console.error('[Auth] fetchProfile failed:', error)
          setAuthError('Failed to load your profile. Please sign in again.')
          setProfile(null)
        }
        return false
      }

      setProfile(data)
      setAuthError(null)
      return true
    } catch (err) {
      console.error('[Auth] fetchProfile unexpected error:', err)
      setAuthError('An unexpected error occurred. Please sign in again.')
      setProfile(null)
      return false
    } finally {
      finishLoading()
    }
  }, [finishLoading])

  useEffect(() => {
    // Safety net: if everything hangs (network down, Supabase cold start,
    // RLS block), unblock the app after 5 seconds so users see the login
    // page instead of a frozen spinner.
    const timeout = setTimeout(() => {
      console.warn('[Auth] Loading timed out — unblocking app')
      finishLoading()
    }, 5000)

    // Initial session hydration
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile(session.user.id)
        } else {
          finishLoading()
        }
      })
      .catch((err) => {
        console.error('[Auth] getSession failed:', err)
        setAuthError('Unable to reach the server. Check your connection.')
        finishLoading()
      })

    // Single shared listener for the entire app lifetime
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)

        if (session?.user) {
          if (
            _event === 'INITIAL_SESSION' ||
            _event === 'SIGNED_IN'       ||
            _event === 'USER_UPDATED'
          ) {
            await fetchProfile(session.user.id)
          }
          // TOKEN_REFRESHED: session is still valid, skip profile re-fetch
        } else {
          setProfile(null)
          setAuthError(null)
          loadingDone.current = false
          finishLoading()
        }
      }
    )

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [fetchProfile, finishLoading])

  const signIn = useCallback(async (email, password) => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    setAuthError(null)
    loadingDone.current = false
    await supabase.auth.signOut()
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
