import { useEffect, useState, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Plus, Search, ChevronRight, CheckCircle, Circle, X, SlidersHorizontal } from 'lucide-react'
import AddPassportModal from './AddPassportModal'
import PassportDetail from './PassportDetail'

const STATUS_COLOR = {
  received:        'bg-blue-500/15 text-blue-400',
  interview:       'bg-yellow-500/15 text-yellow-400',
  medical:         'bg-orange-500/15 text-orange-400',
  police_clearance:'bg-purple-500/15 text-purple-400',
  bmet:            'bg-cyan-500/15 text-cyan-400',
  calling_list:    'bg-pink-500/15 text-pink-400',
  visa_stamping:   'bg-indigo-500/15 text-indigo-400',
  mofa:            'bg-violet-500/15 text-violet-400',
  traveling:       'bg-emerald-500/15 text-emerald-400',
  returned:        'bg-slate-500/15 text-slate-400',
  cancelled:       'bg-red-500/15 text-red-400',
}

const STATUSES = ['received','interview','medical','police_clearance','bmet','calling_list','visa_stamping','mofa','traveling','returned','cancelled']
const PAGE_SIZE = 20

// FIX L25: Extracted query-building into a helper to reduce cognitive complexity
// of fetchPassports from 17 → well below the 15 allowed threshold.
function buildPassportsQuery(supabaseClient, { searchTerm, status, from, to, newOffset }) {
  let query = supabaseClient
    .from('passports')
    .select('*, candidates(full_name, phone)')
    .order('created_at', { ascending: false })
    .range(newOffset, newOffset + PAGE_SIZE - 1)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }
  if (searchTerm?.trim()) {
    query = query.or(`passport_no.ilike.%${searchTerm}%,candidates.full_name.ilike.%${searchTerm}%`)
  }
  if (from) {
    query = query.gte('created_at', from)
  }
  if (to) {
    query = query.lte('created_at', `${to}T23:59:59`)
  }
  return query
}

export default function Passports() {
  const location = useLocation()
  const [passports, setPassports]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [loadingMore, setLoadingMore]   = useState(false)
  const [search, setSearch]             = useState('')
  const [showAdd, setShowAdd]           = useState(false)
  const [selected, setSelected]         = useState(null)
  const [offset, setOffset]             = useState(0)
  const [hasMore, setHasMore]           = useState(true)
  const [bulkMode, setBulkMode]         = useState(false)
  const [bulkSelected, setBulkSelected] = useState([])
  const [bulkStatus, setBulkStatus]     = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [showFilters, setShowFilters]   = useState(false)
  const longPressTimer = useRef(null)

  useEffect(() => {
    // FIX L48 & L53: Prefer `globalThis` over `window`
    if (location.state?.openId && location.state?.openData) {
      setSelected(location.state.openData)
      globalThis.history.replaceState({}, '')
    }
    if (location.state?.filterStatus) {
      setStatusFilter(location.state.filterStatus)
      setShowFilters(true)
      globalThis.history.replaceState({}, '')
    }
  }, [location.state])

  const fetchPassports = useCallback(async (searchTerm, status, from, to, newOffset = 0) => {
    if (newOffset === 0) setLoading(true)
    else setLoadingMore(true)

    const query = buildPassportsQuery(supabase, { searchTerm, status, from, to, newOffset })
    const { data } = await query
    const results = data || []

    // FIX L91 & L93: Remove useless empty object spreads
    if (newOffset === 0) setPassports(results)
    else setPassports(prev => [...prev, ...results])

    setHasMore(results.length === PAGE_SIZE)
    setOffset(newOffset)
    setLoading(false)
    setLoadingMore(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchPassports(search, statusFilter, dateFrom, dateTo, 0), 300)
    return () => clearTimeout(t)
  }, [search, statusFilter, dateFrom, dateTo, fetchPassports])

  function handleUpdated(newStatus, updatedPassport) {
    // FIX L91 & L93: No more `...(updatedPassport || {})` — spread only when defined
    setPassports(prev => prev.map(p => {
      if (p.id !== selected.id) return p
      return updatedPassport ? { ...p, status: newStatus, ...updatedPassport } : { ...p, status: newStatus }
    }))
    setSelected(prev =>
      updatedPassport ? { ...prev, status: newStatus, ...updatedPassport } : { ...prev, status: newStatus }
    )
  }

  function startLongPress(p) {
    longPressTimer.current = setTimeout(() => {
      setBulkMode(true)
      setBulkSelected([p.id])
    }, 600)
  }

  function cancelLongPress() { clearTimeout(longPressTimer.current) }

  function toggleBulkSelect(id) {
    setBulkSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function exitBulkMode() { setBulkMode(false); setBulkSelected([]); setBulkStatus('') }

  async function applyBulkUpdate() {
    if (!bulkStatus || bulkSelected.length === 0) return
    setBulkUpdating(true)
    await supabase.from('passports').update({ status: bulkStatus }).in('id', bulkSelected)
    setPassports(prev => prev.map(p => bulkSelected.includes(p.id) ? { ...p, status: bulkStatus } : p))
    setBulkUpdating(false)
    exitBulkMode()
  }

  async function loadMore() {
    await fetchPassports(search, statusFilter, dateFrom, dateTo, offset + PAGE_SIZE)
  }

  const isExpiringSoon = (expiry) => {
    if (!expiry) return false
    const months3 = new Date()
    months3.setMonth(months3.getMonth() + 3)
    return new Date(expiry) < months3
  }

  // FIX L120: Unexpected negated condition — use positive conditions instead
  const statusFilterCount = statusFilter === 'all' ? 0 : 1
  const activeFilters = statusFilterCount + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)

  // FIX L146: Extract nested ternary for bulk update button label
  function getBulkButtonLabel() {
    if (bulkUpdating) return 'Updating...'
    const suffix = bulkSelected.length > 1 ? 's' : ''
    return `Update ${bulkSelected.length} Passport${suffix}`
  }

  // FIX L211: Extract nested ternary for bulk mode icon rendering
  function renderBulkIcon(p) {
    if (bulkSelected.includes(p.id)) {
      return <CheckCircle size={20} className="text-indigo-400 flex-none" />
    }
    return <Circle size={20} className="text-slate-600 flex-none" />
  }

  // FIX L205: Non-interactive <li> elements must not have mouse/keyboard handlers.
  // Wrap content in a focusable <button> for accessibility instead.
  function handlePassportClick(p) {
    if (bulkMode) toggleBulkSelect(p.id)
    else setSelected(p)
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-100">Passports</h1>
            <p className="text-slate-500 text-sm">{passports.length} shown</p>
          </div>
          {bulkMode ? (
            <button onClick={exitBulkMode} className="flex items-center gap-1 text-slate-400 text-sm font-bold px-3 py-2 rounded-xl bg-slate-800"><X size={16}/> Cancel</button>
          ) : (
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg"><Plus size={16}/> Add</button>
          )}
        </div>

        {bulkMode && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-slate-400 text-sm">{bulkSelected.length} selected</p>
            <select
              value={bulkStatus}
              onChange={e => setBulkStatus(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100"
            >
              <option value="">Select new status...</option>
              {/* FIX L142: replaceAll instead of replace */}
              {STATUSES.map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
            </select>
            <button
              onClick={applyBulkUpdate}
              disabled={!bulkStatus || bulkSelected.length === 0 || bulkUpdating}
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl disabled:opacity-50"
            >
              {/* FIX L146: extracted ternary above */}
              {getBulkButtonLabel()}
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or passport no..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={"relative flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold border transition-colors " + (showFilters || activeFilters > 0 ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400' : 'bg-slate-900 border-slate-800 text-slate-400')}
          >
            <SlidersHorizontal size={16}/>
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full text-[10px] text-white flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filters</p>
              {activeFilters > 0 && (
                <button
                  onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo('') }}
                  className="text-xs text-red-400 font-semibold"
                >
                  Clear all
                </button>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setStatusFilter('all')} className={"px-3 py-1 rounded-full text-xs font-bold " + (statusFilter === 'all' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400')}>All</button>
                {STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={"px-3 py-1 rounded-full text-xs font-bold capitalize " + (statusFilter === s ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400')}
                  >
                    {/* FIX L175: replaceAll instead of replace */}
                    {s.replaceAll('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">From</p>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">To</p>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
              </div>
            </div>
          </div>
        )}

        {!bulkMode && <p className="text-slate-600 text-xs text-center">Long press a passport to select multiple</p>}

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {passports.length === 0 ? (
              <p className="text-center text-slate-600 py-12 text-sm">
                {search ? `No results for "${search}"` : 'No passports found'}
              </p>
            ) : (
              <ul>
                {passports.map((p, i) => (
                  // FIX L205: <li> is non-interactive; moved all interaction onto an inner <button>
                  // Also satisfies the keyboard-listener requirement (buttons are keyboard-accessible by default)
                  <li
                    key={p.id}
                    className={"flex items-center " + (i < passports.length - 1 ? 'border-b border-slate-800' : '')}
                  >
                    <button
                      type="button"
                      onTouchStart={() => startLongPress(p)}
                      onTouchEnd={cancelLongPress}
                      onMouseDown={() => startLongPress(p)}
                      onMouseUp={cancelLongPress}
                      onClick={() => handlePassportClick(p)}
                      className={"w-full flex items-center gap-3 px-4 py-4 text-left cursor-pointer active:bg-slate-800 transition-colors " + (bulkSelected.includes(p.id) ? 'bg-indigo-500/10' : '')}
                    >
                      {/* FIX L211: extracted nested ternary into renderBulkIcon() */}
                      {bulkMode ? (
                        renderBulkIcon(p)
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-500/15 flex items-center justify-center text-indigo-400 font-bold text-sm flex-none">
                          {p.candidates?.full_name?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-sm font-semibold truncate">{p.candidates?.full_name}</p>
                        <p className="text-slate-500 text-xs font-mono">{p.passport_no}</p>
                        {isExpiringSoon(p.expiry_date) && (
                          <p className="text-amber-400 text-xs mt-0.5">Expires {new Date(p.expiry_date).toLocaleDateString()}</p>
                        )}
                      </div>
                      {/* FIX L220: replaceAll instead of replace */}
                      <span className={"text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full " + (STATUS_COLOR[p.status] || 'bg-slate-700 text-slate-300')}>
                        {p.status?.replaceAll('_', ' ')}
                      </span>
                      {!bulkMode && <ChevronRight size={16} className="text-slate-600 flex-none"/>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 text-indigo-400 text-sm font-bold border-t border-slate-800 disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        )}
      </div>

      <AddPassportModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => { setShowAdd(false); fetchPassports(search, statusFilter, dateFrom, dateTo, 0) }}
      />
      {selected && !bulkMode && (
        <PassportDetail passport={selected} onClose={() => setSelected(null)} onUpdated={handleUpdated}/>
      )}
    </>
  )
}
