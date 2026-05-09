import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// Read the Supabase session directly from localStorage without ANY network call.
// Supabase JS v2 stores the session under a key like:
//   sb-<project-ref>-auth-token
// This bypasses getSession() which can hang on slow networks.
function readSessionFromStorage() {
  try {
    const key = Object.keys(localStorage).find(k =>
      k.startsWith('sb-') && k.endsWith('-auth-token')
    )
    if (!key) return null
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Check token not expired
    const expiresAt = parsed?.expires_at
    if (expiresAt && expiresAt < Math.floor(Date.now() / 1000)) {
      console.warn('[Auth] Stored token expired, will need refresh')
      return null // expired — fall through to network refresh
    }
    return parsed
  } catch (e) {
    return null
  }
}

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
      if (error && error.code !== 'PGRST116') {
        console.error('[Auth] fetchProfile failed:', error)
        setAuthError('Failed to load profile.')
      }
      setProfile(data ?? null)
    } catch (err) {
      console.error('[Auth] fetchProfile error:', err)
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    // ── INSTANT PATH: read token directly from localStorage ────────────────
    // No network call. No Supabase SDK. Just parse the stored JSON.
    // This runs synchronously and unblocks the UI immediately.
    const storedSession = readSessionFromStorage()

    if (storedSession?.user) {
      console.log('[Auth] Found stored session, unblocking immediately')
      setUser(storedSession.user)
      setLoading(false) // ← unblock UI RIGHT NOW
      // Fetch profile in background — don't block on it
      fetchProfile(storedSession.user.id)
    }

    // ── Safety net: 10s timeout if no stored session ───────────────────────
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      console.warn('[Auth] Loading timed out — unblocking app')
      setLoading(false)
    }, 10000)

    // ── Supabase listener: keeps session in sync ───────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log('[Auth] onAuthStateChange:', _event)

        if (_event === 'INITIAL_SESSION' && storedSession?.user) {
          // Already handled above — just clear the timeout
          clearTimeout(timeout)
          return
        }

        setUser(session?.user ?? null)

        if (!session?.user) {
          setProfile(null)
          setAuthError(null)
          clearTimeout(timeout)
          setLoading(false)
          return
        }

        if (
          _event === 'INITIAL_SESSION' ||
          _event === 'SIGNED_IN' ||
          _event === 'USER_UPDATED'
        ) {
          clearTimeout(timeout)
          if (!storedSession?.user) {
            // No stored session — we were waiting on this
            await fetchProfile(session.user.id)
            setLoading(false)
          }
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
    setLoading(true)
    setUser(null)
    setProfile(null)
    await supabase.auth.signOut()
    setLoading(false)
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
