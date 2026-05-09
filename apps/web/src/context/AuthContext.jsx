import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null)
  const [profile, setProfile]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [authError, setAuthError] = useState(null)
  const resolved                  = useRef(false)

  const finish = useCallback((u, p) => {
    if (resolved.current) return
    resolved.current = true
    setUser(u ?? null)
    setProfile(p ?? null)
    setLoading(false)
  }, [])

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (error && error.code !== 'PGRST116') {
        console.error('[Auth] fetchProfile failed:', error)
        setAuthError('Failed to load profile.')
      }
      return data ?? null
    } catch (err) {
      console.error('[Auth] fetchProfile error:', err)
      return null
    }
  }, [])

  useEffect(() => {
    // ── FAST PATH: read session from localStorage immediately, no network ──
    // getSession() reads the stored session synchronously from localStorage
    // without making any network call. This resolves instantly even offline.
    // We use this to unblock the UI immediately, then let onAuthStateChange
    // handle token refresh in the background.
    const boot = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          // We have a stored session — show the app immediately
          // with the stored user, then fetch profile in background
          setUser(session.user)
          setLoading(false)  // unblock UI NOW, don't wait for profile
          const p = await fetchProfile(session.user.id)
          setProfile(p)
        } else {
          finish(null, null)
        }
      } catch (err) {
        console.error('[Auth] boot error:', err)
        finish(null, null)
      }
    }

    boot()

    // ── Safety net: 15s in case everything above hangs ─────────────────────
    const timeout = setTimeout(() => {
      console.warn('[Auth] Loading timed out — unblocking app')
      if (!resolved.current) {
        resolved.current = true
        setLoading(false)
      }
    }, 15000)

    // ── Background: keep session in sync after initial load ─────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (_event === 'INITIAL_SESSION') return // handled by boot() above
        setUser(session?.user ?? null)
        if (!session?.user) {
          setProfile(null)
          setAuthError(null)
        } else if (_event === 'SIGNED_IN' || _event === 'USER_UPDATED') {
          const p = await fetchProfile(session.user.id)
          setProfile(p)
        }
      }
    )

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [fetchProfile, finish])

  const signIn = useCallback(async (email, password) => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    setAuthError(null)
    resolved.current = false
    setLoading(true)
    await supabase.auth.signOut()
    finish(null, null)
  }, [finish])

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
