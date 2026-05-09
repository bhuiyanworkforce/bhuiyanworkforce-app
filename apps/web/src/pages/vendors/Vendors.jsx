import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, Building2, X, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react'

const VCATEGORIES = ['general','embassy','medical','travel','printing','bank','other']

function AddVendorModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name:'', phone:'', email:'', address:'', category:'general', notes:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    const { error: err } = await supabase.from('vendors').insert({ ...form, notes: form.notes||null })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[82vh] overflow-y-auto mb-16">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">Add Vendor</h2>
          <button type="button" onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <div className="p-5 pb-10 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Name *</span>
            <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Vendor / Company name" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Category</span>
            <select value={form.category} onChange={e=>set('category',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              {VCATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Phone</span>
              <input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="01XXXXXXXXX" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Email</span>
              <input value={form.email} onChange={e=>set('email',e.target.value)} placeholder="Optional" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Address</span>
            <input value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Optional" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Notes</span>
            <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={2} placeholder="Optional" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"/>
          </label>
          <button type="button" onClick={handleSave} disabled={saving} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-xl font-bold text-sm mt-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Vendor'}
          </button>
        </div>
      </div>
    </div>
  )
}

AddVendorModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

function VendorDetail({ vendor, onClose }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('expenses').select('*').eq('vendor_id', vendor.id).order('date', { ascending: false })
      .then(({ data }) => { setExpenses(data || []); setLoading(false) })
  }, [vendor.id])

  const total = expenses.reduce((s, e) => s + Number.parseFloat(e.amount || 0), 0)

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22}/></button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-sm">{vendor.name}</p>
          <p className="text-slate-500 text-xs capitalize">{vendor.category} {vendor.phone ? '· '+vendor.phone : ''}</p>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          {[
            { label: 'Phone', value: vendor.phone || '—' },
            { label: 'Email', value: vendor.email || '—' },
            { label: 'Category', value: vendor.category || '—' },
            { label: 'Total Spent', value: '৳' + total.toLocaleString() },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{f.label}</p>
              <p className="text-slate-200 text-sm font-semibold">{f.value}</p>
            </div>
          ))}
          {vendor.address && (
            <div className="col-span-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Address</p>
              <p className="text-slate-200 text-sm">{vendor.address}</p>
            </div>
          )}
          {vendor.notes && (
            <div className="col-span-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Notes</p>
              <p className="text-slate-400 text-sm">{vendor.notes}</p>
            </div>
          )}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-slate-300">Expense History</h3>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"/></div>
          ) : expenses.length === 0 ? (
            <p className="text-center text-slate-600 py-8 text-sm">No expenses recorded</p>
          ) : (
            <ul>
              {expenses.map((e, i) => (
                <li key={e.id} className={`px-4 py-3 flex justify-between items-center ${i < expenses.length-1 ? 'border-b border-slate-800' : ''}`}>
                  <div>
                    <p className="text-slate-200 text-sm font-semibold">{e.description || e.category}</p>
                    <p className="text-slate-500 text-xs">{e.date ? new Date(e.date).toLocaleDateString() : '—'}</p>
                  </div>
                  <p className="text-amber-400 font-bold text-sm">৳{Number.parseFloat(e.amount).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

VendorDetail.propTypes = {
  vendor: PropTypes.shape({
    id:       PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name:     PropTypes.string.isRequired,
    category: PropTypes.string,
    phone:    PropTypes.string,
    email:    PropTypes.string,
    address:  PropTypes.string,
    notes:    PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
}

export default function Vendors() {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => { fetchVendors() }, [])

  async function fetchVendors() {
    setError(null)
    try {
      const { data, error: viewErr } = await supabase.from('vendor_balances').select('*').order('name')
      if (viewErr) {
        // fallback to vendors table directly if view fails
        const { data: d2, error: tableErr } = await supabase.from('vendors').select('*').order('name')
        if (tableErr) throw tableErr
        setVendors(d2 || [])
      } else {
        setVendors(data || [])
      }
    } catch {
      setError('Failed to load vendors. Tap refresh to try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await fetchVendors()
    setRefreshing(false)
  }

  const filtered = vendors.filter(v =>
    v.name?.toLowerCase().includes(search.toLowerCase()) || v.phone?.includes(search)
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Vendors</h1>
          <p className="text-slate-500 text-sm">{vendors.length} vendors</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={()=>setShowAdd(true)} className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
            <Plus size={16}/> Add
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
        <label htmlFor="vendor-search" className="sr-only">Search vendors</label>
        <input id="vendor-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vendors..." className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"/>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertTriangle size={28} className="text-red-400" />
          <p className="text-red-400 text-sm text-center">{error}</p>
          <button onClick={handleRefresh} className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm">Retry</button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"/></div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-600">
              <Building2 size={32} className="mb-3"/>
              <p className="text-sm">{search ? 'No vendors match your search' : 'No vendors yet'}</p>
            </div>
          ) : (
            <ul>
              {filtered.map((v, i) => (
                <li key={v.id} className={`flex items-center gap-3 px-4 py-4 transition-colors ${i < filtered.length-1 ? 'border-b border-slate-800' : ''}`}>
                  <button type="button" className="flex items-center gap-3 flex-1 min-w-0 text-left active:bg-slate-800" onClick={() => setSelected(v)}>
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center flex-none"><Building2 size={18} className="text-cyan-400"/></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200 text-sm font-semibold truncate">{v.name}</p>
                      <p className="text-slate-500 text-xs capitalize">{v.category} {v.phone ? '· '+v.phone : ''}</p>
                    </div>
                    {v.total_spent > 0 && <p className="text-amber-400 text-sm font-bold flex-none">৳{Number.parseFloat(v.total_spent).toLocaleString()}</p>}
                    <ChevronRight size={16} className="text-slate-600 flex-none"/>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showAdd && <AddVendorModal onClose={()=>setShowAdd(false)} onSaved={()=>{setShowAdd(false);fetchVendors()}}/>}
      {selected && <VendorDetail vendor={selected} onClose={()=>setSelected(null)}/>}
    </div>
  )
}
