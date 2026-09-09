import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { safeDelete } from '../../lib/utils'
import { Plus, Search, Globe, X, ChevronRight, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react'
import { ListSkeleton } from '../../components/Skeleton'

const REGISTRY_OPTS = [
  { key: 'verified', label: 'Verified in registry', score: 0 },
  { key: 'pending', label: 'Check pending', score: 2 },
  { key: 'not_found', label: 'Not found / unverifiable', score: 4 },
]
const ADDRESS_OPTS = [
  { key: 'commercial', label: 'Commercial address', score: 0 },
  { key: 'unknown', label: 'Unclear / unconfirmed', score: 2 },
  { key: 'residential', label: 'Residential address', score: 3 },
]
const CHAIN_OPTS = [
  { key: 'direct', label: 'Direct contact', score: 0 },
  { key: 'one_intermediary', label: 'One intermediary', score: 1 },
  { key: 'two_plus', label: 'Two+ intermediaries', score: 3 },
]

function yearsScore(years) {
  const y = Number.parseFloat(years)
  if (Number.isNaN(y)) return 2
  if (y < 1) return 2
  if (y <= 3) return 1
  return 0
}

function computeRisk(a) {
  const reg = REGISTRY_OPTS.find(o => o.key === a.registry_status)?.score ?? 2
  const addr = ADDRESS_OPTS.find(o => o.key === a.address_type)?.score ?? 2
  const chain = CHAIN_OPTS.find(o => o.key === a.chain_depth)?.score ?? 1
  const yrs = yearsScore(a.years_active)
  const total = reg + addr + chain + yrs
  let level = 'low'
  if (total >= 7) level = 'high'
  else if (total >= 3) level = 'medium'
  return { total, level }
}

const RISK_STYLE = {
  high:   { text: 'text-red-400',     bg: 'bg-red-500/15' },
  medium: { text: 'text-amber-400',   bg: 'bg-amber-500/15' },
  low:    { text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
}

function emptyForm() {
  return {
    name: '', country: '', corridor: '',
    contact_name: '', contact_phone: '', contact_email: '',
    registry_status: 'pending', address_type: 'unknown', chain_depth: 'direct',
    years_active: '', notes: '',
  }
}

function AddAgentModal({ onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) {
      setError('Your session has expired. Please log in again.')
      setSaving(false)
      return
    }
    const { error: err } = await supabase.from('agents').insert({
      ...form,
      years_active: form.years_active === '' ? null : Number.parseFloat(form.years_active),
      notes: form.notes || null,
      created_by: user.id,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  const preview = computeRisk(form)
  const style = RISK_STYLE[preview.level]
  const inputClass = "bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto mb-16">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">Add Agent</h2>
          <button type="button" onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="p-5 pb-10 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Name *</span>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Entity or agency name" className={inputClass} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Country</span>
              <input value={form.country} onChange={e => set('country', e.target.value)} placeholder="e.g. Serbia" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Corridor</span>
              <input value={form.corridor} onChange={e => set('corridor', e.target.value)} placeholder="e.g. Serbia placement chain" className={inputClass} />
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
            <span className="text-xs text-slate-500 font-semibold">Registry check</span>
            <select value={form.registry_status} onChange={e => set('registry_status', e.target.value)} className={inputClass}>
              {REGISTRY_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Address type</span>
            <select value={form.address_type} onChange={e => set('address_type', e.target.value)} className={inputClass}>
              {ADDRESS_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Contact chain</span>
            <select value={form.chain_depth} onChange={e => set('chain_depth', e.target.value)} className={inputClass}>
              {CHAIN_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Years active (if known)</span>
            <input type="number" min="0" value={form.years_active} onChange={e => set('years_active', e.target.value)} className={inputClass} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Notes</span>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={`${inputClass} resize-none`} />
          </label>

          <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${style.bg}`}>
            <span className="text-xs text-slate-400">Computed risk with current fields</span>
            <span className={`text-sm font-bold ${style.text}`}>{preview.level.toUpperCase()} · {preview.total}</span>
          </div>

          <button type="button" onClick={handleSave} disabled={saving || !form.name.trim()}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white py-3 rounded-xl font-bold text-sm mt-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}

AddAgentModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

function AgentDetail({ agent, onClose }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const risk = computeRisk(agent)
  const style = RISK_STYLE[risk.level]

  const flags = []
  if (agent.registry_status === 'not_found') flags.push('No registry record found for this entity.')
  if (agent.registry_status === 'pending') flags.push('Registry check not yet completed.')
  if (agent.address_type === 'residential') flags.push('Registered at a residential address, not a commercial one.')
  if (agent.address_type === 'unknown') flags.push('Address type not confirmed.')
  if (agent.chain_depth === 'two_plus') flags.push('Two or more intermediaries between you and the principal.')
  if (agent.chain_depth === 'one_intermediary') flags.push('One intermediary in the chain — verify their standing too.')
  const y = Number.parseFloat(agent.years_active)
  if (!Number.isNaN(y) && y < 1) flags.push('Entity has been active less than a year.')

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-sm">{agent.name}</p>
          <p className="text-slate-500 text-xs">{[agent.country, agent.corridor].filter(Boolean).join(' · ') || 'No location set'}</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>{risk.level.toUpperCase()} · {risk.total}</span>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          {[
            { label: 'Contact', value: agent.contact_name || '—' },
            { label: 'Phone', value: agent.contact_phone || '—' },
            { label: 'Email', value: agent.contact_email || '—' },
            { label: 'Years active', value: agent.years_active ? agent.years_active + ' yrs' : 'Unknown' },
            { label: 'Registry status', value: REGISTRY_OPTS.find(o => o.key === agent.registry_status)?.label || '—' },
            { label: 'Address type', value: ADDRESS_OPTS.find(o => o.key === agent.address_type)?.label || '—' },
            { label: 'Contact chain', value: CHAIN_OPTS.find(o => o.key === agent.chain_depth)?.label || '—' },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{f.label}</p>
              <p className="text-slate-200 text-sm font-semibold">{f.value}</p>
            </div>
          ))}
        </div>

        <div className={`rounded-2xl p-4 ${style.bg}`}>
          <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${style.text}`}>Risk flags</p>
          {flags.length === 0 ? (
            <p className="text-slate-300 text-sm">No structural red flags from the fields on record.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {flags.map((f, i) => <li key={i} className="text-slate-300 text-sm">• {f}</li>)}
            </ul>
          )}
        </div>

        {agent.notes && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Notes</p>
            <p className="text-slate-400 text-sm whitespace-pre-wrap">{agent.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

AgentDetail.propTypes = {
  agent: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    country: PropTypes.string,
    corridor: PropTypes.string,
    contact_name: PropTypes.string,
    contact_phone: PropTypes.string,
    contact_email: PropTypes.string,
    registry_status: PropTypes.string,
    address_type: PropTypes.string,
    chain_depth: PropTypes.string,
    years_active: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    notes: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
}

export default function Agents() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { fetchAgents() }, [])

  async function fetchAgents() {
    setError(null)
    try {
      const { data, error: err } = await supabase.from('agents').select('*').order('created_at', { ascending: false })
      if (err) throw err
      setAgents(data || [])
    } catch {
      setError('Failed to load agents. Tap refresh to try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await fetchAgents()
    setRefreshing(false)
  }

  async function handleDelete(id) {
    const result = await safeDelete(supabase, 'agents', 'id', id)
    setConfirmDelete(null)
    if (!result.ok) { alert(result.message); return }
    fetchAgents()
  }

  const withRisk = agents.map(a => ({ ...a, risk: computeRisk(a) }))
  const filtered = withRisk
    .filter(a => riskFilter === 'all' || a.risk.level === riskFilter)
    .filter(a => a.name?.toLowerCase().includes(search.toLowerCase()) || a.country?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.risk.total - a.risk.total)

  const counts = { high: 0, medium: 0, low: 0 }
  withRisk.forEach(a => { counts[a.risk.level]++ })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Agents</h1>
          <p className="text-slate-500 text-sm">International intermediary partners · {agents.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <label htmlFor="agent-search" className="sr-only">Search agents</label>
        <input id="agent-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or country..." className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          ['all', `All (${agents.length})`],
          ['high', `High (${counts.high})`],
          ['medium', `Medium (${counts.medium})`],
          ['low', `Low (${counts.low})`],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setRiskFilter(key)}
            className={`flex-none text-xs font-bold px-3 py-1.5 rounded-full border ${riskFilter === key ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10' : 'border-slate-800 text-slate-500'}`}>
            {label}
          </button>
        ))}
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
              <Globe size={32} className="mb-3" />
              <p className="text-sm">{search || riskFilter !== 'all' ? 'No agents match this view' : 'No agents recorded yet'}</p>
            </div>
          ) : (
            <ul>
              {filtered.map((a, i) => {
                const style = RISK_STYLE[a.risk.level]
                return (
                  <li key={a.id} className={`flex items-center gap-3 px-4 py-4 ${i < filtered.length - 1 ? 'border-b border-slate-800' : ''}`}>
                    <button type="button" className="flex items-center gap-3 flex-1 min-w-0 text-left active:bg-slate-800" onClick={() => setSelected(a)}>
                      <div className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center flex-none`}>
                        <Globe size={18} className={style.text} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-sm font-semibold truncate">{a.name}</p>
                        <p className="text-slate-500 text-xs">{[a.country, a.corridor].filter(Boolean).join(' · ') || 'No location set'}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full flex-none ${style.bg} ${style.text}`}>{a.risk.level.toUpperCase()}</span>
                      <ChevronRight size={16} className="text-slate-600 flex-none" />
                    </button>
                    {confirmDelete === a.id ? (
                      <div className="flex flex-col items-end gap-1 flex-none">
                        <button onClick={() => handleDelete(a.id)} className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold">Delete</button>
                        <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-600 px-2 py-0.5">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(a.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1 flex-none">
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

      {showAdd && <AddAgentModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchAgents() }} />}
      {selected && <AgentDetail agent={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
