import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react'
import AddVisaModal from './AddVisaModal'
import VisaDetail from './VisaDetail'
import { ListSkeleton } from '../../components/Skeleton'

const STATUS_COLOR = {
  draft:      'bg-slate-500/15 text-slate-400',
  submitted:  'bg-indigo-500/15 text-indigo-400',
  in_review:  'bg-amber-500/15 text-amber-400',
  at_embassy: 'bg-violet-500/15 text-violet-400',
  approved:   'bg-emerald-500/15 text-emerald-400',
  rejected:   'bg-red-500/15 text-red-400',
}

const FILTERS = ['all', 'draft', 'submitted', 'in_review', 'at_embassy', 'approved', 'rejected']

function getDeadlineClass(deadline) {
  const now = Date.now()
  const deadlineMs = new Date(deadline).getTime()
  if (deadlineMs < now) return 'text-red-400'
  const daysLeft = Math.ceil((deadlineMs - now) / 86400000)
  if (daysLeft <= 7) return 'text-amber-400'
  return 'text-slate-600'
}

function getFilterLabel(f, apps, counts) {
  if (f === 'all') return `All (${apps.length})`
  const label = f.replace('_', ' ')
  return counts[f] ? `${label} (${counts[f]})` : label
}

export default function VisaApplications() {
  const [apps, setApps]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [search, setSearch]       = useState('')
  const [filter, setFilter]     = useState('all')
  const [showAdd, setShowAdd]   = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => { fetchApps() }, [])

  async function fetchApps() {
    // FIX: Wrap in try/catch/finally so setLoading(false) is ALWAYS called,
    // even when the query throws (network error, RLS error, Supabase cold start).
    // Without this, any thrown exception left loading=true forever on refresh.
    try {
      const { data, error } = await supabase
        .from('visa_applications')
        .select('*, candidates(full_name), passports(passport_no)')
        .order('created_at', { ascending: false })
      if (error) throw error
      setApps(data || [])
    } catch (err) {
      console.error('[VisaApplications] fetchApps failed:', err)
      setFetchError(err.message || 'Failed to load visa applications')
      setApps([])
    } finally {
      setLoading(false)
    }
  }

  function handleUpdated(newStatus) {
    setApps(prev => prev.map(a => a.id === selected.id ? { ...a, status: newStatus } : a))
    setSelected(prev => ({ ...prev, status: newStatus }))
  }

  const filtered = apps.filter(a => {
    const matchSearch =
      a.candidates?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.country?.toLowerCase().includes(search.toLowerCase()) ||
      a.visa_type?.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || a.status === filter
    return matchSearch && matchFilter
  })

  const counts = FILTERS.slice(1).reduce((acc, s) => {
    acc[s] = apps.filter(a => a.status === s).length
    return acc
  }, {})

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-100">Visa</h1>
            <p className="text-slate-500 text-sm">{apps.length} applications</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
            <Plus size={16}/> Add
          </button>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
          <label htmlFor="visa-search" className="sr-only">Search visa applications</label>
          <input id="visa-search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, country, or type..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"/>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={"px-3 py-1.5 rounded-full text-xs font-bold capitalize whitespace-nowrap transition-colors " + (filter === f ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400')}>
              {getFilterLabel(f, apps, counts)}
            </button>
          ))}
        </div>

        {loading ? (
          <ListSkeleton rows={6} hasSearch={false} hasTabs={true} />
        ) : fetchError ? (
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
            <AlertTriangle size={24} className="text-red-400" />
            <p className="text-slate-300 text-sm font-semibold">Failed to load visa applications</p>
            <p className="text-slate-500 text-xs">{fetchError}</p>
            <button onClick={fetchApps}
              className="flex items-center gap-2 bg-slate-800 text-slate-200 font-bold px-4 py-2 rounded-xl text-sm">
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-600 text-sm mb-3">No visa applications found</p>
                <button onClick={() => setShowAdd(true)} className="text-amber-400 text-sm font-semibold">+ Add first application</button>
              </div>
            ) : (
              <ul>
                {filtered.map((a, i) => (
                  <li key={a.id}
                    className={"flex items-center gap-3 px-4 py-4 transition-colors " + (i < filtered.length - 1 ? 'border-b border-slate-800' : '')}>
                    <button
                      type="button"
                      className="contents cursor-pointer"
                      onClick={() => setSelected(a)}
                      onKeyDown={e => e.key === 'Enter' && setSelected(a)}
                    >
                      <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 font-bold text-sm flex-none">
                        {a.candidates?.full_name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-sm font-semibold truncate">{a.candidates?.full_name}</p>
                        <p className="text-slate-500 text-xs">{a.visa_type} · {a.country}</p>
                        {a.deadline && (
                          <p className={`text-xs mt-0.5 ${getDeadlineClass(a.deadline)}`}>
                            Due: {new Date(a.deadline).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-none">
                        <span className={"text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full " + (STATUS_COLOR[a.status] || 'bg-slate-700 text-slate-300')}>
                          {a.status?.replace('_', ' ')}
                        </span>
                      </div>
                      <ChevronRight size={16} className="text-slate-600 flex-none"/>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {showAdd && <AddVisaModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchApps() }}/>}
      {selected && <VisaDetail visa={selected} onClose={() => setSelected(null)} onUpdated={handleUpdated}/>}
    </>
  )
}
