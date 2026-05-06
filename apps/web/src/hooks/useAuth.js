import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error }
}

async function signOut() {
  await supabase.auth.signOut()
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) fetchProfile(session.user.id)
        else { setProfile(null); setLoading(false) }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) console.error('PROFILE FETCH ERROR:', JSON.stringify(error))
    else console.log('PROFILE FETCH OK:', JSON.stringify(data))
    setProfile(data)
    setLoading(false)
  }

  return { user, profile, loading, signIn, signOut }
}
