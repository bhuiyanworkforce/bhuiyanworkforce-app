import { useState, useEffect, useCallback } from 'react'

/**
 * useSupabaseQuery — eliminates the repeated loading/error/data boilerplate
 * that appears in every page component.
 *
 * Usage:
 *   const { data, loading, error, refresh } = useSupabaseQuery(
 *     () => supabase.from('expenses').select('*').order('date', { ascending: false }),
 *     []  // deps — re-runs when these change (like useEffect)
 *   )
 *
 * The query function must return a Supabase query builder or any Promise that
 * resolves to { data, error }.
 *
 * @param {() => Promise<{ data: any, error: any }>} queryFn
 * @param {any[]} deps - dependency array (same semantics as useEffect)
 * @param {{ fallback?: any }} options
 */
export function useSupabaseQuery(queryFn, deps = [], { fallback = [] } = {}) {
  const [data, setData]       = useState(fallback)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: result, error: err } = await queryFn()
      if (err) throw err
      setData(result ?? fallback)
    } catch (err) {
      setError(err?.message ?? 'Something went wrong')
      setData(fallback)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { run() }, [run])

  return { data, loading, error, refresh: run }
}

/**
 * useFormState — eliminates the repeated form state + setter boilerplate.
 *
 * Usage:
 *   const [form, set, resetForm] = useFormState({ name: '', amount: '' })
 *   set('name', 'Alice')        // update one field
 *   set({ name: 'Alice', amount: '100' })  // update multiple at once
 *   resetForm()                 // reset to initial defaults
 */
export function useFormState(defaults) {
  const [form, setForm] = useState(defaults)

  const set = useCallback((keyOrObj, value) => {
    if (typeof keyOrObj === 'string') {
      setForm(prev => ({ ...prev, [keyOrObj]: value }))
    } else {
      // called with an object — merge all keys at once
      setForm(prev => ({ ...prev, ...keyOrObj }))
    }
  }, [])

  const resetForm = useCallback(() => setForm(defaults), [defaults])

  return [form, set, resetForm]
}
