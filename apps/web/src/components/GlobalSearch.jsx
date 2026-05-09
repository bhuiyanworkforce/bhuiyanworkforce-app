import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Search, X, User, Stamp, FileText, Wallet, ChevronRight, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const RESULT_TYPES = {
  candidate: { icon: User,     color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: 'Candidate' },
  passport:  { icon: Stamp,    color: 'text-indigo-400',  bg: 'bg-indigo-500/15',  label: 'Passport'  },
  visa:      { icon: FileText, color: 'text-amber-400',   bg: 'bg-amber-500/15',   label: 'Visa'      },
  invoice:   { icon: Wallet,   color: 'text-pink-400',    bg: 'bg-pink-500/15',    label: 'Invoice'   },
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearchError(null); return }
    const timeout = setTimeout(() => search(query), 300)
    return () => clearTimeout(timeout)
  }, [query])

  async function search(q) {
    setLoading(true)
    setSearchError(null)
    // Escape PostgREST ilike special characters so user input like "%" or "_"
    // is treated as a literal character, not a wildcard pattern.
    const safe = q.replace(/[%_\\]/g, '\\$&')
    const term = `%${safe}%`

    try {
      const [
        { data: candidates, error: e1 },
        { data: passports,  error: e2 },
        { data: visas,      error: e3 },
        { data: invoices,   error: e4 },
      ] = await Promise.all([
        supabase.from('candidates')
          .select('id, full_name, phone, nationality')
          .or(`full_name.ilike.${term},phone.ilike.${term}`)
          .limit(4),
        supabase.from('passports')
          .select('id, passport_no, status, candidates(full_name)')
          .or(`passport_no.ilike.${term}`)
          .limit(4),
        supabase.from('visa_applications')
          .select('id, visa_type, country, status, candidates(full_name)')
          .or(`visa_type.ilike.${term},country.ilike.${term}`)
          .limit(3),
        supabase.from('invoices')
          .select('id, invoice_no, total, status, candidates(full_name)')
          .or(`invoice_no.ilike.${term}`)
          .limit(3),
      ])

      // Surface the first error encountered across all queries
      const firstError = e1 || e2 || e3 || e4
      if (firstError) throw firstError

      const all = [
        ...(candidates || []).map(c => ({
          id: c.id, type: 'candidate',
          title: c.full_name,
          subtitle: `${c.phone || ''} · ${c.nationality || ''}`,
          path: '/candidates',
          data: c,
        })),
        ...(passports || []).map(p => ({
          id: p.id, type: 'passport',
          title: p.passport_no,
          subtitle: `${p.candidates?.full_name} · ${p.status?.replaceAll('_', ' ')}`,
          path: '/passports',
          data: p,
        })),
        ...(visas || []).map(v => ({
          id: v.id, type: 'visa',
          title: `${v.visa_type || 'Visa'} — ${v.country || ''}`,
          subtitle: `${v.candidates?.full_name} · ${v.status?.replaceAll('_', ' ')}`,
          path: '/visa',
          data: v,
        })),
        ...(invoices || []).map(i => ({
          id: i.id, type: 'invoice',
          title: i.invoice_no,
          subtitle: `${i.candidates?.full_name} · ৳${Number.parseFloat(i.total||0).toLocaleString()} · ${i.status}`,
          path: '/accounts',
          data: i,
        })),
      ]

      setResults(all)
    } catch (err) {
      console.error('GlobalSearch error:', err)
      setSearchError('Search failed. Check your connection and try again.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(result) {
    navigate(result.path, { state: { openId: result.id, openData: result.data } })
    setOpen(false)
    setQuery('')
    setResults([])
  }

  function handleClose() {
    setOpen(false)
    setQuery('')
    setResults([])
    setSearchError(null)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-slate-400 hover:text-slate-200 transition-colors"
        aria-label="Search"
      >
        <Search size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-[#050D1A] flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-[#080F1E]">
            <Search size={18} className="text-slate-500 flex-none" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search candidates, passports, invoices..."
              className="flex-1 bg-transparent text-slate-100 text-base placeholder-slate-500 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-slate-500 hover:text-slate-300 flex-none"
              >
                <X size={18} />
              </button>
            )}
            <button
              onClick={handleClose}
              className="text-indigo-400 text-sm font-semibold flex-none ml-1"
            >
              Cancel
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {!query && (
              <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                <Search size={40} className="mb-4 opacity-30" />
                <p className="text-sm">Search across all records</p>
                <p className="text-xs mt-1 text-slate-700">Candidates · Passports · Visa · Invoices</p>
              </div>
            )}

            {query && loading && (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {query && !loading && searchError && (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                <AlertTriangle size={28} className="text-red-400" />
                <p className="text-red-400 text-sm">{searchError}</p>
                <button
                  onClick={() => search(query)}
                  className="text-indigo-400 text-xs font-semibold">
                  Retry
                </button>
              </div>
            )}

            {query && !loading && !searchError && results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                <p className="text-sm">No results for "<span className="text-slate-400">{query}</span>"</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="flex flex-col gap-2">
                {['candidate','passport','visa','invoice'].map(type => {
                  const group = results.filter(r => r.type === type)
                  if (group.length === 0) return null
                  const { icon: Icon, color, bg, label } = RESULT_TYPES[type]

                  return (
                    <div key={type}>
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-1 mb-2 mt-3">
                        {label}s
                      </p>
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                        {group.map((result, i) => (
                          <button
                            key={result.id}
                            onClick={() => handleSelect(result)}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-800 transition-colors ${
                              i < group.length - 1 ? 'border-b border-slate-800' : ''
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-none`}>
                              <Icon size={16} className={color} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-200 text-sm font-semibold truncate">{result.title}</p>
                              <p className="text-slate-500 text-xs truncate capitalize">{result.subtitle}</p>
                            </div>
                            <ChevronRight size={16} className="text-slate-600 flex-none" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
