import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, TrendingDown } from 'lucide-react'
import { EXPENSE_CATEGORIES as CATEGORIES, EXPENSE_CAT_COLOR as CAT_COLOR } from '../../lib/constants'
import Modal from '../../components/Modal'

// CATEGORIES and CAT_COLOR are now imported from ../../lib/constants

function AddExpenseModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), category:'other', description:'', amount:'', payment_method:'cash', reference_no:'', vendor_id:'' })
  const [vendors, setVendors] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k,v) => setForm(p=>({...p,[k]:v}))

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
    <Modal open onClose={onClose} title="Add Expense" maxWidth="max-w-lg">
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
    </Modal>
  )
}

AddExpenseModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { fetchExpenses() }, [])

  async function fetchExpenses() {
    try {
      const { data, error } = await supabase.from('expenses').select('*, vendors(name)').order('date', { ascending: false })
      if (error) throw error
      setExpenses(data || [])
    } catch (err) {
      console.error('[Expenses] fetchExpenses failed:', err)
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = expenses.filter(e =>
    (filterCat === 'all' || e.category === filterCat) &&
    e.description?.toLowerCase().includes(search.toLowerCase())
  )
  const total = filtered.reduce((s,e) => s + Number.parseFloat(e.amount||0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-slate-100">Expenses</h1><p className="text-slate-500 text-sm">{expenses.length} records</p></div>
        <button onClick={()=>setShowAdd(true)} className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-pink-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg"><Plus size={16}/> Add</button>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center flex-none"><TrendingDown size={20} className="text-rose-400"/></div>
        <div><p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Expenses</p><p className="text-xl font-extrabold text-rose-400">৳{total.toLocaleString()}</p></div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all',...CATEGORIES].map(c=>(
          <button key={c} onClick={()=>setFilterCat(c)} className={`flex-none px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${filterCat===c?'bg-indigo-500 text-white':'bg-slate-800 text-slate-400'}`}>{c.replaceAll('_',' ')}</button>
        ))}
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
        <label htmlFor="expense-search" className="sr-only">Search expenses</label>
        <input id="expense-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search expenses..." className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"/>
      </div>
      {loading ? <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"/></div> : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? <p className="text-center text-slate-600 py-12 text-sm">No expenses found</p> : (
            <ul>{filtered.map((e,i)=>(
              <li key={e.id} className={`flex items-center gap-3 px-4 py-4 ${i<filtered.length-1?'border-b border-slate-800':''}`}>
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
      {showAdd && <AddExpenseModal onClose={()=>setShowAdd(false)} onSaved={()=>{setShowAdd(false);fetchExpenses()}}/>}
    </div>
  )
}
