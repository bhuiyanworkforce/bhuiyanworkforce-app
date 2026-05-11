import PropTypes from 'prop-types'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, TrendingDown, X } from 'lucide-react'
import { EXPENSE_CATEGORIES as CATEGORIES, EXPENSE_CAT_COLOR as CAT_COLOR } from '../../lib/constants'
import { ListSkeleton } from '../../components/Skeleton'

const PAGE_SIZE = 25

function AddExpenseModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), category:'other', description:'', amount:'', payment_method:'cash', reference_no:'', vendor_id:'' })
  const [vendors, setVendors] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  // FIX: Escape key closes the modal (WCAG 2.1 SC 1.4.13)
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    supabase.from('vendors').select('id,name').order('name').then(({data})=>setVendors(data||[]))
  }, [])

  async function handleSave() {
    if (!form.description || !form.amount) { setError('Description and amount required'); return }
    setSaving(true)
    const { error: err } = await supabase.from('expenses').insert({ ...form, amount: Number.parseFloat(form.amount), vendor_id: form.vendor_id||null, reference_no: form.reference_no||null })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[82vh] overflow-y-auto mb-16">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">Add Expense</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="p-5 pb-10 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Date</span>
              <input type="date" value={form.date} onChange={e=>set('date',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Category</span>
              <select value={form.category} onChange={e=>set('category',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
                {CATEGORIES.map(c=><option key={c} value={c}>{c.replaceAll('_',' ')}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Description *</span>
            <input value={form.description} onChange={e=>set('description',e.target.value)} placeholder="What was this for?" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Amount (৳) *</span>
            <input type="number" min="0" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Payment Method</span>
              <select value={form.payment_method} onChange={e=>set('payment_method',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="mobile">Mobile Banking</option>
                <option value="cheque">Cheque</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Reference No.</span>
              <input value={form.reference_no} onChange={e=>set('reference_no',e.target.value)} placeholder="Optional" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
            </label>
          </div>
          {vendors.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Vendor (optional)</span>
              <select value={form.vendor_id} onChange={e=>set('vendor_id',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
                <option value="">— No vendor —</option>
                {vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          )}
          <button onClick={handleSave} disabled={saving} className="w-full bg-gradient-to-r from-rose-500 to-pink-600 text-white py-3 rounded-xl font-bold text-sm mt-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Expense'}
          </button>
        </div>
      </div>
    </div>
  )
}

AddExpenseModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

export default function Expenses() {
  const [expenses, setExpenses]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore]       = useState(false)
  const [offset, setOffset]         = useState(0)
  const [total, setTotal]           = useState(0)
  const [search, setSearch]         = useState('')
  const [filterCat, setFilterCat]   = useState('all')
  const [showAdd, setShowAdd]       = useState(false)

  const fetchExpenses = useCallback(async (newOffset = 0, searchTerm = search, cat = filterCat) => {
    if (newOffset === 0) setLoading(true); else setLoadingMore(true)
    try {
      let q = supabase
        .from('expenses')
        .select('*, vendors(name)', { count: 'exact' })
        .order('date', { ascending: false })
        .range(newOffset, newOffset + PAGE_SIZE - 1)

      if (cat !== 'all') q = q.eq('category', cat)
      if (searchTerm)    q = q.ilike('description', `%${searchTerm}%`)

      const { data, error, count } = await q
      if (error) throw error

      const rows = data || []
      setExpenses(prev => newOffset === 0 ? rows : [...prev, ...rows])
      setTotal(count || 0)
      setOffset(newOffset)
      setHasMore(newOffset + PAGE_SIZE < (count || 0))
    } catch (err) {
      console.error('[Expenses] fetchExpenses failed:', err)
      if (newOffset === 0) setExpenses([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [search, filterCat])

  useEffect(() => { fetchExpenses(0) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch from page 1 when filters change
  function handleSearch(val) {
    setSearch(val)
    fetchExpenses(0, val, filterCat)
  }
  function handleCat(cat) {
    setFilterCat(cat)
    fetchExpenses(0, search, cat)
  }

  // Running total of loaded rows (server filters, so all loaded rows match)
  const runningTotal = expenses.reduce((s,e) => s + Number.parseFloat(e.amount||0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-slate-100">Expenses</h1><p className="text-slate-500 text-sm">{total} records</p></div>
        <button onClick={()=>setShowAdd(true)} className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-pink-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg"><Plus size={16}/> Add</button>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center flex-none"><TrendingDown size={20} className="text-rose-400"/></div>
        <div><p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Expenses{(search || filterCat !== 'all') ? ' (filtered)' : ''}</p><p className="text-xl font-extrabold text-rose-400">৳{runningTotal.toLocaleString()}</p></div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all',...CATEGORIES].map(c=>(
          <button key={c} onClick={()=>handleCat(c)} className={`flex-none px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${filterCat===c?'bg-indigo-500 text-white':'bg-slate-800 text-slate-400'}`}>{c.replaceAll('_',' ')}</button>
        ))}
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
        <label htmlFor="expense-search" className="sr-only">Search expenses</label>
        <input id="expense-search" value={search} onChange={e=>handleSearch(e.target.value)} placeholder="Search expenses..." className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"/>
      </div>
      {loading ? <ListSkeleton rows={6} hasSearch={false} hasTabs={false} /> : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {expenses.length === 0 ? <p className="text-center text-slate-600 py-12 text-sm">No expenses found</p> : (
            <ul>{expenses.map((e,i)=>(
              <li key={e.id} className={`flex items-center gap-3 px-4 py-4 ${i<expenses.length-1?'border-b border-slate-800':''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${CAT_COLOR[e.category]||CAT_COLOR.other}`}>{e.category?.replaceAll('_',' ')}</span>
                    {e.vendors?.name && <span className="text-[10px] text-slate-500">{e.vendors.name}</span>}
                  </div>
                  <p className="text-slate-200 text-sm font-semibold truncate">{e.description}</p>
                  <p className="text-slate-500 text-xs">{new Date(e.date).toLocaleDateString()} · {e.payment_method}</p>
                </div>
                <p className="text-rose-400 font-bold text-sm flex-none">৳{Number.parseFloat(e.amount).toLocaleString()}</p>
              </li>
            ))}</ul>
          )}
        </div>
      )}
      {hasMore && (
        <button
          onClick={() => fetchExpenses(offset + PAGE_SIZE)}
          disabled={loadingMore}
          className="w-full py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold disabled:opacity-50">
          {loadingMore ? 'Loading…' : `Load More (${total - expenses.length} remaining)`}
        </button>
      )}
      {showAdd && <AddExpenseModal onClose={()=>setShowAdd(false)} onSaved={()=>{setShowAdd(false);fetchExpenses(0)}}/>}
    </div>
  )
}
