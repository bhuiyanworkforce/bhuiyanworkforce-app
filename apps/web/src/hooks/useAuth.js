import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const loadingDone = useRef(false)

  // Single helper so setLoading(false) is never called twice
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
        // PGRST116 = no rows — profile not created yet, not a real error
        if (error.code === 'PGRST116') {
          setProfile(null)
        } else {
          console.error('fetchProfile failed:', error)
          setAuthError('Failed to load your profile. Please sign in again.')
          setProfile(null)
        }
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
      finishLoading()
    }
  }, [finishLoading])

  useEffect(() => {
    // FIX: 5-second safety net timeout.
    // If fetchProfile or getSession hangs for any reason — RLS blocking the
    // profiles query, Supabase cold start, network stall — this guarantees
    // loading is always cleared and the app never freezes on the spinner.
    const timeout = setTimeout(() => {
      console.warn('[useAuth] Loading timed out after 5s — unblocking app')
      finishLoading()
    }, 5000)

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
        console.error('[useAuth] getSession failed:', err)
        setAuthError('Unable to reach the server. Check your connection.')
        finishLoading()
      })

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
        } else {
          setProfile(null)
          setAuthError(null)
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
    if (error) {
      setAuthError(error.message)
    }
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    setAuthError(null)
    loadingDone.current = false
    await supabase.auth.signOut()
  }, [])

  return { user, profile, loading, authError, signIn, signOut }
}
