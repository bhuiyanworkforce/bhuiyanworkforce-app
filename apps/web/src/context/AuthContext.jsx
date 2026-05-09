import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null)
  const [profile, setProfile]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [authError, setAuthError] = useState(null)
  const loadingDone               = useRef(false)

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
      finishLoading()
    }
  }, [finishLoading])

  useEffect(() => {
    // ── Safety net 1: auth timeout (network totally dead) ──────────────────
    const authTimeout = setTimeout(() => {
      console.warn('[Auth] Loading timed out — unblocking app')
      finishLoading()
    }, 15000)

    // ── Safety net 2: getSession() fallback ────────────────────────────────
    // If the service worker serves a stale page, onAuthStateChange may never
    // fire INITIAL_SESSION. getSession() reads directly from localStorage and
    // resolves immediately — it does NOT make a network call.
    // This runs in parallel and whichever path resolves first wins (the
    // loadingDone ref ensures finishLoading() only fires once).
    supabase.auth.getSession().then(({ data: { session } }) => {
      // If onAuthStateChange already handled this, loadingDone is true → skip
      if (loadingDone.current) return
      console.log('[Auth] getSession() fallback fired')
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        finishLoading()
      }
    })

    // ── Primary path: onAuthStateChange ───────────────────────────────────
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
        } else {
          setProfile(null)
          setAuthError(null)
          finishLoading()
        }
      }
    )

    return () => {
      clearTimeout(authTimeout)
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
    setLoading(true)
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
