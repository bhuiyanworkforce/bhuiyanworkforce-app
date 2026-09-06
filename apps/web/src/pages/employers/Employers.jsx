import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { safeDelete } from '../../lib/utils'
import { Plus, Search, Handshake, X, ChevronRight, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react'
import { ListSkeleton } from '../../components/Skeleton'

const CONTRACT_STATUSES = ['prospect', 'negotiating', 'active', 'inactive']

const STATUS_STYLE = {
  prospect:    { text: 'text-slate-400',   bg: 'bg-slate-500/15' },
  negotiating: { text: 'text-amber-400',   bg: 'bg-amber-500/15' },
  active:      { text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  inactive:    { text: 'text-red-400',     bg: 'bg-red-500/15' },
}

function emptyForm() {
  return {
    company_name: '', country: '', industry: '',
    contact_name: '', contact_phone: '', contact_email: '',
    contract_status: 'prospect', notes: '',
  }
}

function AddEmployerModal({ onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const inputClass = "bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSave() {
    if (!form.company_name.trim()) { setError('Company name is required'); return }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { error: err } = await supabase.from('employers').insert({
      ...form,
      notes: form.notes || null,
      created_by: session?.user?.id ?? null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto mb-16">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">Add Employer</h2>
          <button type="button" onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="p-5 pb-10 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Company name *</span>
            <input value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Company name" className={inputClass} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Country</span>
              <input value={form.country} onChange={e => set('country', e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Industry</span>
              <input value={form.industry} onChange={e => set('industry', e.target.value)} placeholder="e.g. Hospitality" className={inputClass} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Contact name</span>
              <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Contact phone</span>
              <input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} className={inputClass} />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Contact email</span>
            <input value={form.contact_email} onChange={e => set('contact_email', e.target.value)} className={inputClass} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Contract status</span>
            <select value={form.contract_status} onChange={e => set('contract_status', e.target.value)} className={inputClass}>
              {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Notes</span>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Open positions, terms discussed, next steps..." className={`${inputClass} resize-none`} />
          </label>

          <button type="button" onClick={handleSave} disabled={saving || !form.company_name.trim()}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 rounded-xl font-bold text-sm mt-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Employer'}
          </button>
        </div>
      </div>
    </div>
  )
}

AddEmployerModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

function EmployerDetail({ employer, onClose }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const style = STATUS_STYLE[employer.contract_status] || STATUS_STYLE.prospect

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-sm">{employer.company_name}</p>
          <p className="text-slate-500 text-xs">{[employer.country, employer.industry].filter(Boolean).join(' · ') || 'No details set'}</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${style.bg} ${style.text}`}>{employer.contract_status}</span>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          {[
            { label: 'Contact', value: employer.contact_name || '—' },
            { label: 'Phone', value: employer.contact_phone || '—' },
            { label: 'Email', value: employer.contact_email || '—' },
            { label: 'Industry', value: employer.industry || '—' },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{f.label}</p>
              <p className="text-slate-200 text-sm font-semibold">{f.value}</p>
            </div>
          ))}
        </div>

        {employer.notes && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Notes</p>
            <p className="text-slate-400 text-sm whitespace-pre-wrap">{employer.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

EmployerDetail.propTypes = {
  employer: PropTypes.shape({
    id: PropTypes.string.isRequired,
    company_name: PropTypes.string.isRequired,
    country: PropTypes.string,
    industry: PropTypes.string,
    contact_name: PropTypes.string,
    contact_phone: PropTypes.string,
    contact_email: PropTypes.string,
    contract_status: PropTypes.string,
    notes: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
}

export default function Employers() {
  const [employers, setEmployers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { fetchEmployers() }, [])

  async function fetchEmployers() {
    setError(null)
    try {
      const { data, error: err } = await supabase.from('employers').select('*').order('created_at', { ascending: false })
      if (err) throw err
      setEmployers(data || [])
    } catch {
      setError('Failed to load employers. Tap refresh to try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await fetchEmployers()
    setRefreshing(false)
  }

  async function handleDelete(id) {
    const result = await safeDelete(supabase, 'employers', 'id', id)
    setConfirmDelete(null)
    if (!result.ok) { alert(result.message); return }
    fetchEmployers()
  }

  const filtered = employers.filter(e =>
    e.company_name?.toLowerCase().includes(search.toLowerCase()) || e.country?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Employers</h1>
          <p className="text-slate-500 text-sm">Direct-hire companies · {employers.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <label htmlFor="employer-search" className="sr-only">Search employers</label>
        <input id="employer-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by company or country..." className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertTriangle size={28} className="text-red-400" />
          <p className="text-red-400 text-sm text-center">{error}</p>
          <button onClick={handleRefresh} className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm">Retry</button>
        </div>
      ) : loading ? (
        <ListSkeleton rows={4} hasSearch={false} hasTabs={false} />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-600">
              <Handshake size={32} className="mb-3" />
              <p className="text-sm">{search ? 'No employers match your search' : 'No employers yet'}</p>
            </div>
          ) : (
            <ul>
              {filtered.map((e, i) => {
                const style = STATUS_STYLE[e.contract_status] || STATUS_STYLE.prospect
                return (
                  <li key={e.id} className={`flex items-center gap-3 px-4 py-4 ${i < filtered.length - 1 ? 'border-b border-slate-800' : ''}`}>
                    <button type="button" className="flex items-center gap-3 flex-1 min-w-0 text-left active:bg-slate-800" onClick={() => setSelected(e)}>
                      <div className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center flex-none`}>
                        <Handshake size={18} className={style.text} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-sm font-semibold truncate">{e.company_name}</p>
                        <p className="text-slate-500 text-xs">{[e.country, e.industry].filter(Boolean).join(' · ') || 'No details set'}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full capitalize flex-none ${style.bg} ${style.text}`}>{e.contract_status}</span>
                      <ChevronRight size={16} className="text-slate-600 flex-none" />
                    </button>
                    {confirmDelete === e.id ? (
                      <div className="flex flex-col items-end gap-1 flex-none">
                        <button onClick={() => handleDelete(e.id)} className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold">Delete</button>
                        <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-600 px-2 py-0.5">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(e.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1 flex-none">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {showAdd && <AddEmployerModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchEmployers() }} />}
      {selected && <EmployerDetail employer={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
