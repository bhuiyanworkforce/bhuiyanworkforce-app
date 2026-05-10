import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Plus, Receipt, AlertTriangle, Search, RefreshCw } from 'lucide-react'
import CreateInvoiceModal from './CreateInvoiceModal'
import InvoiceDetail from './InvoiceDetail'
import { AccountsSkeleton } from '../../components/Skeleton'

const PAGE_SIZE = 20

const STATUS_COLOR = {
  unpaid: 'bg-red-500/15 text-red-400',
  partial: 'bg-amber-500/15 text-amber-400',
  paid: 'bg-emerald-500/15 text-emerald-400',
  cancelled: 'bg-slate-500/15 text-slate-400',
}

function isOverdue(inv) {
  if (!inv.due_date) return false
  if (inv.status === 'paid' || inv.status === 'cancelled') return false
  return new Date(inv.due_date) < new Date()
}

// ─── BUG 4 FIX ───────────────────────────────────────────────────────────────
// The original code fetched only 20 invoices (PAGE_SIZE) server-side and then
// ran `.filter()` on that local array for both search and status filtering.
// This meant: if the user searched for an invoice on page 3, it would silently
// return no results — even though the record exists in the database.
//
// Fix: push search and status filter into the Supabase query itself, so the
// server filters across all rows. Pagination (Load More) still works because
// it re-runs the same server-filtered query with an increased offset.
//
// The totals and overdue banner always query the FULL dataset (no filters)
// so they reflect the true financial position regardless of the active search.
// ─────────────────────────────────────────────────────────────────────────────

export default function Accounts() {
  const location = useLocation()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState(null)
  const [totals, setTotals] = useState({ paid: 0, unpaid: 0 })
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [overdue, setOverdue] = useState([])
  const [overdueTotal, setOverdueTotal] = useState(0)

  useEffect(() => {
    if (location.state?.openId && location.state?.openData) {
      setSelected(location.state.openData)
      globalThis.history.replaceState({}, '')
    }
  }, [location.state])

  // ─── BUG FIX: two-query merge for invoice search ─────────────────────────────
  // PostgREST does not support filtering on a foreign-table column via a plain
  // .or() string (e.g. "candidates.full_name.ilike.%x%") — it silently returns
  // no results for the joined-column branch.
  //
  // Fix mirrors the pattern already applied in Passports.jsx:
  //   - When there is no search term: single paginated query (fast path).
  //   - When there IS a search term: two parallel queries (by invoice_no and by
  //     candidate name), then merge + deduplicate client-side.
  //
  // Status and overdue filters are applied inside the base() builder so they
  // work correctly for both branches.
  // ─────────────────────────────────────────────────────────────────────────────
  async function fetchInvoicesBySearch(currentSearch, currentFilter, newOffset) {
    function base() {
      let q = supabase
        .from('invoices')
        .select('*, candidates(full_name)')
        .order('issued_at', { ascending: false })

      if (currentFilter === 'overdue') {
        const today = new Date().toISOString().split('T')[0]
        q = q.lt('due_date', today).not('status', 'in', '("paid","cancelled")')
      } else if (currentFilter !== 'all') {
        q = q.eq('status', currentFilter)
      }
      return q
    }

    const term = currentSearch.trim()

    if (!term) {
      // No search — simple paginated query
      const { data, error } = await base().range(newOffset, newOffset + PAGE_SIZE - 1)
      if (error) throw error
      return data || []
    }

    // Escape PostgREST ilike special characters
    const safe = term.replace(/[%_\\]/g, '$&')
    // Two parallel queries: by invoice_no OR by candidate name
    const [byInvoiceNo, byCandidateName] = await Promise.all([
      base().ilike('invoice_no', `%${safe}%`).limit(PAGE_SIZE),
      base().ilike('candidates.full_name', `%${safe}%`).limit(PAGE_SIZE),
    ])

    if (byInvoiceNo.error) throw byInvoiceNo.error
    if (byCandidateName.error) throw byCandidateName.error

    // Merge and deduplicate by invoice id
    const seen = new Set()
    const merged = []
    for (const inv of [...(byInvoiceNo.data || []), ...(byCandidateName.data || [])]) {
      if (!seen.has(inv.id)) {
        seen.add(inv.id)
        merged.push(inv)
      }
    }

    // Apply pagination on the merged result
    return merged.slice(newOffset, newOffset + PAGE_SIZE)
  }

  const fetchInvoices = useCallback(async (newOffset = 0, currentSearch = search, currentFilter = filter) => {
    if (newOffset === 0) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    try {
      const results = await fetchInvoicesBySearch(currentSearch, currentFilter, newOffset)

      if (newOffset === 0) {
        setInvoices(results)
      } else {
        setInvoices(prev => [...prev, ...results])
      }

      setHasMore(results.length === PAGE_SIZE)
      setOffset(newOffset)

      // Totals always reflect the FULL dataset (unfiltered) so the financial
      // summary at the top is always accurate regardless of active filters.
      if (newOffset === 0) {
        const { data: allInv } = await supabase
          .from('invoices')
          .select('total, status, due_date')

        const inv = allInv || []
        setTotals({
          paid: inv.filter(i => i.status === 'paid').reduce((s, i) => s + (Number(i.total) || 0), 0),
          unpaid: inv.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + (Number(i.total) || 0), 0),
        })
        const od = inv.filter(isOverdue)
        setOverdue(od)
        setOverdueTotal(od.reduce((s, i) => s + (Number(i.total) || 0), 0))
      }
    } catch {
      setError('Failed to load invoices. Tap refresh to try again.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch from page 0 whenever search or filter changes
  useEffect(() => {
    fetchInvoices(0, search, filter)
  // fetchInvoices is stable (no deps), so this only re-runs on search/filter changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchInvoices(0, search, filter)
    setRefreshing(false)
  }

  function handleUpdated(newStatus, receiptNo) {
    setInvoices(prev => prev.map(inv =>
      inv.id === selected.id ? { ...inv, status: newStatus } : inv
    ))
    setSelected(prev => ({ ...prev, status: newStatus, receipt_no: receiptNo || prev.receipt_no }))
    fetchInvoices(0, search, filter)
  }

  function getFilterLabel(key) {
    if (key !== 'overdue') return key === 'all' ? 'All' : key.charAt(0).toUpperCase() + key.slice(1)
    return overdue.length ? `Overdue (${overdue.length})` : 'Overdue'
  }

  function getFilterButtonClass(key) {
    if (filter !== key) return 'bg-slate-800 text-slate-400'
    if (key === 'overdue') return 'bg-red-500 text-white'
    return 'bg-indigo-500 text-white'
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-100">Accounts</h1>
            <p className="text-slate-500 text-sm">{invoices.length}{hasMore ? '+' : ''} invoices</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} disabled={refreshing}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
              <Plus size={16} /> Invoice
            </button>
          </div>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <label htmlFor="invoice-search" className="sr-only">Search invoices</label>
          <input
            id="invoice-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by invoice no or candidate..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {overdue.length > 0 && (
          <button type="button" onClick={() => setFilter('overdue')}
            className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 flex items-center gap-3 w-full text-left">
            <AlertTriangle size={18} className="text-red-400 flex-none" />
            <div className="flex-1">
              <p className="text-red-400 text-sm font-bold">{overdue.length} overdue invoice{overdue.length > 1 ? 's' : ''}</p>
              <p className="text-slate-500 text-xs">past due · ৳{overdueTotal.toLocaleString()}</p>
            </div>
          </button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Received</p>
            <p className="text-xl font-extrabold text-emerald-400">৳{totals.paid.toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Outstanding</p>
            <p className="text-xl font-extrabold text-red-400">৳{totals.unpaid.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {['all', 'unpaid', 'partial', 'overdue', 'paid'].map(key => (
            <button key={key} onClick={() => setFilter(key)}
              className={`flex-none px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${getFilterButtonClass(key)}`}>
              {getFilterLabel(key)}
            </button>
          ))}
        </div>

        {error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-red-400 text-sm text-center">{error}</p>
            <button onClick={handleRefresh} className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm">Retry</button>
          </div>
        ) : loading ? (
          <AccountsSkeleton />
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                <Receipt size={32} className="mb-3" />
                <p className="text-sm">{search ? 'No invoices match your search' : 'No invoices found'}</p>
                {!search && (
                  <button onClick={() => setShowCreate(true)} className="mt-4 text-indigo-400 text-sm font-semibold">
                    Create your first invoice
                  </button>
                )}
              </div>
            ) : (
              <>
                <ul>
                  {invoices.map((inv, i) => (
                    <li key={inv.id}
                      className={`flex items-center justify-between px-4 py-4 ${i < invoices.length - 1 ? 'border-b border-slate-800' : ''}`}>
                      <button type="button" className="contents" onClick={() => setSelected(inv)}>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-indigo-400 text-xs font-mono font-semibold">{inv.invoice_no}</p>
                            {isOverdue(inv) && <AlertTriangle size={11} className="text-red-400" />}
                          </div>
                          <p className="text-slate-200 text-sm font-semibold mt-0.5">{inv.candidates?.full_name}</p>
                          <p className="text-slate-500 text-xs">
                            {new Date(inv.issued_at).toLocaleDateString()}
                            {inv.due_date && isOverdue(inv) && (
                              <span className="text-red-400 ml-1.5">· due {new Date(inv.due_date).toLocaleDateString()}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <p className="text-slate-100 text-sm font-bold">৳{(Number(inv.total) || 0).toLocaleString()}</p>
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_COLOR[inv.status] || 'bg-slate-700 text-slate-300'}`}>
                            {inv.status}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                {hasMore && (
                  <button
                    onClick={() => fetchInvoices(offset + PAGE_SIZE, search, filter)}
                    disabled={loadingMore}
                    className="w-full py-3 text-indigo-400 text-sm font-bold border-t border-slate-800 hover:bg-slate-800 transition-colors disabled:opacity-50">
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showCreate && <CreateInvoiceModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchInvoices(0, search, filter) }} />}
      {selected && <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} onUpdated={handleUpdated} />}
    </>
  )
}
