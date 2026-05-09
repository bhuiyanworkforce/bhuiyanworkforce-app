import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, X, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react'

const STATUS_COLOR = { pending:'bg-amber-500/15 text-amber-400', cleared:'bg-emerald-500/15 text-emerald-400', bounced:'bg-red-500/15 text-red-400', cancelled:'bg-slate-500/15 text-slate-400' }
const TYPE_COLOR   = { receivable:'bg-blue-500/15 text-blue-400', payable:'bg-rose-500/15 text-rose-400' }

function AddChequeModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ cheque_no:'', type:'receivable', party_name:'', bank_name:'', amount:'', issue_date:'', due_date: new Date().toISOString().slice(0,10), notes:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  async function handleSave() {
    if (!form.cheque_no || !form.party_name || !form.amount || !form.due_date) { setError('Cheque no, party, amount and due date required'); return }
    setSaving(true)
    const { error: err } = await supabase.from('cheques').insert({ ...form, amount: Number.parseFloat(form.amount), issue_date: form.issue_date||null, notes: form.notes||null, bank_name: form.bank_name||null })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[82vh] overflow-y-auto mb-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">Add Cheque</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <div className="p-5 pb-24 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Type</span>
            <div className="grid grid-cols-2 gap-2">
              {['receivable','payable'].map(t=>(
                <button key={t} onClick={()=>set('type',t)} className={`py-2.5 rounded-xl text-sm font-bold capitalize transition-colors ${form.type===t?'bg-indigo-500 text-white':'bg-slate-800 text-slate-400'}`}>{t}</button>
              ))}
            </div>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Cheque No. *</span>
              <input value={form.cheque_no} onChange={e=>set('cheque_no',e.target.value)} placeholder="123456" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Bank Name</span>
              <input value={form.bank_name} onChange={e=>set('bank_name',e.target.value)} placeholder="Optional" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Party Name *</span>
            <input value={form.party_name} onChange={e=>set('party_name',e.target.value)} placeholder="Payer / Payee name" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Amount (৳) *</span>
            <input type="number" min="0" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Issue Date</span>
              <input type="date" value={form.issue_date} onChange={e=>set('issue_date',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Due Date *</span>
              <input type="date" value={form.due_date} onChange={e=>set('due_date',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Notes</span>
            <input value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Optional" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <button onClick={handleSave} disabled={saving} className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white py-3 rounded-xl font-bold text-sm mt-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Cheque'}
          </button>
        </div>
      </div>
    </div>
  )
}

AddChequeModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

function ChequeDetail({ cheque: initial, onClose, onUpdated }) {
  const [cheque, setCheque] = useState(initial)
  const [updating, setUpdating] = useState(false)

  async function updateStatus(status) {
    setUpdating(true)
    await supabase.from('cheques').update({ status }).eq('id', cheque.id)
    if (status === 'cleared' && cheque.type === 'payable') {
      await supabase.from('expenses').insert({
        date: new Date().toISOString().split('T')[0],
        category: 'other',
        description: `Cheque cleared — ${cheque.cheque_no} · ${cheque.party_name}`,
        amount: Number.parseFloat(cheque.amount || 0),
        payment_method: 'cheque',
        reference_no: cheque.cheque_no,
      })
    }
    setCheque(prev => ({ ...prev, status }))
    onUpdated()
    setUpdating(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22}/></button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-sm">{cheque.party_name}</p>
          <p className="text-slate-500 text-xs font-mono">#{cheque.cheque_no}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-bold ${TYPE_COLOR[cheque.type]}`}>{cheque.type}</span>
      </div>
      <div className="p-4 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex justify-between items-center mb-4">
            <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${STATUS_COLOR[cheque.status]}`}>{cheque.status}</span>
            <p className="text-indigo-400 text-xl font-extrabold">৳{Number.parseFloat(cheque.amount).toLocaleString()}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Cheque No', value: cheque.cheque_no },
              { label: 'Bank', value: cheque.bank_name || '—' },
              { label: 'Issue Date', value: cheque.issue_date ? new Date(cheque.issue_date).toLocaleDateString() : '—' },
              { label: 'Due Date', value: cheque.due_date ? new Date(cheque.due_date).toLocaleDateString() : '—' },
            ].map(f => (
              <div key={f.label}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{f.label}</p>
                <p className="text-slate-200 text-sm font-semibold">{f.value}</p>
              </div>
            ))}
            {cheque.notes && (
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Notes</p>
                <p className="text-slate-400 text-sm">{cheque.notes}</p>
              </div>
            )}
          </div>
        </div>
        {cheque.status === 'pending' && (
          <div className="flex flex-col gap-3">
            <button onClick={() => updateStatus('cleared')} disabled={updating} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50">✓ Mark as Cleared</button>
            <button onClick={() => updateStatus('bounced')} disabled={updating} className="w-full bg-red-500/10 text-red-400 font-semibold py-3 rounded-2xl border border-red-500/20">Mark as Bounced</button>
            <button onClick={() => updateStatus('cancelled')} disabled={updating} className="w-full text-slate-500 font-semibold py-2 rounded-2xl">Cancel Cheque</button>
          </div>
        )}
        {cheque.status === 'cleared' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-center">
            <p className="text-emerald-400 font-bold">✓ Cheque Cleared</p>
          </div>
        )}
        {cheque.status === 'bounced' && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-center">
            <p className="text-red-400 font-bold">✗ Cheque Bounced</p>
            <button type="button" onClick={() => updateStatus('pending')} className="text-xs text-slate-400 mt-2 underline">Reopen as Pending</button>
          </div>
        )}
      </div>
    </div>
  )
}

ChequeDetail.propTypes = {
  cheque: PropTypes.shape({
    id:         PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    cheque_no:  PropTypes.string,
    party_name: PropTypes.string,
    bank_name:  PropTypes.string,
    amount:     PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    issue_date: PropTypes.string,
    due_date:   PropTypes.string,
    notes:      PropTypes.string,
    status:     PropTypes.string,
    type:       PropTypes.string,
  }).isRequired,
  onClose:   PropTypes.func.isRequired,
  onUpdated: PropTypes.func.isRequired,
}

export default function Cheques() {
  const [cheques, setCheques] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => { fetchCheques() }, [])

  async function fetchCheques() {
    setError(null)
    try {
      const { data, error: err } = await supabase.from('cheques').select('*').order('due_date', { ascending: true })
      if (err) throw err
      setCheques(data || [])
    } catch {
      setError('Failed to load cheques. Tap refresh to try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await fetchCheques()
    setRefreshing(false)
  }

  const filtered = filter === 'all' ? cheques : cheques.filter(c => c.status === filter || c.type === filter)
  const tabs = ['all','pending','cleared','bounced','receivable','payable']

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-slate-100">Cheques</h1><p className="text-slate-500 text-sm">{cheques.length} cheques</p></div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={()=>setShowAdd(true)} className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg"><Plus size={16}/> Add</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
          <p className="text-xs text-slate-500 font-semibold">Receivable</p>
          <p className="text-lg font-extrabold text-blue-400">৳{cheques.filter(c=>c.type==='receivable'&&c.status==='pending').reduce((s,c)=>s+Number.parseFloat(c.amount||0),0).toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
          <p className="text-xs text-slate-500 font-semibold">Payable</p>
          <p className="text-lg font-extrabold text-rose-400">৳{cheques.filter(c=>c.type==='payable'&&c.status==='pending').reduce((s,c)=>s+Number.parseFloat(c.amount||0),0).toLocaleString()}</p>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(t=>(
          <button key={t} onClick={()=>setFilter(t)} className={`flex-none px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${filter===t?'bg-indigo-500 text-white':'bg-slate-800 text-slate-400'}`}>{t}</button>
        ))}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertTriangle size={28} className="text-red-400" />
          <p className="text-red-400 text-sm text-center">{error}</p>
          <button onClick={handleRefresh} className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm">Retry</button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? <p className="text-center text-slate-600 py-12 text-sm">No cheques found</p> : (
            <ul>{filtered.map((c,i)=>(
              <li key={c.id} className={`flex items-start gap-2 px-4 py-4 transition-colors ${i<filtered.length-1?'border-b border-slate-800':''}`}>
                <button type="button" onClick={()=>setSelected(c)} className="flex items-start gap-2 w-full text-left active:bg-slate-800">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${TYPE_COLOR[c.type]}`}>{c.type}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>{c.status}</span>
                    </div>
                    <p className="text-slate-200 text-sm font-semibold">{c.party_name}</p>
                    <p className="text-slate-500 text-xs font-mono">#{c.cheque_no} {c.bank_name?'· '+c.bank_name:''}</p>
                    <p className="text-slate-500 text-xs">Due: {new Date(c.due_date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-none">
                    <p className="text-white font-bold text-sm">৳{Number.parseFloat(c.amount).toLocaleString()}</p>
                    <ChevronRight size={16} className="text-slate-600"/>
                  </div>
                </button>
              </li>
            ))}</ul>
          )}
        </div>
      )}
      {showAdd && <AddChequeModal onClose={()=>setShowAdd(false)} onSaved={()=>{setShowAdd(false);fetchCheques()}}/>}
      {selected && <ChequeDetail cheque={selected} onClose={()=>setSelected(null)} onUpdated={fetchCheques}/>}
    </div>
  )
}
