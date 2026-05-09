import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, X, ChevronDown, ChevronUp, AlertTriangle, RefreshCw } from 'lucide-react'

const STATUS_COLOR = {
  active:  'bg-amber-500/15 text-amber-400',
  repaid:  'bg-emerald-500/15 text-emerald-400',
  partial: 'bg-blue-500/15 text-blue-400',
}

function AddLoanModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ agent_id:'', amount:'', issued_date: new Date().toISOString().slice(0,10), due_date:'', purpose:'', notes:'' })
  const [agents, setAgents] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  useEffect(() => {
    supabase.from('agents').select('id, full_name').then(({data})=>setAgents(data||[]))
  }, [])

  async function handleSave() {
    if (!form.agent_id || !form.amount) { setError('Agent and amount required'); return }
    setSaving(true)
    const { error: err } = await supabase.from('loans').insert({
      ...form, amount: Number.parseFloat(form.amount),
      balance: Number.parseFloat(form.amount),
      due_date: form.due_date||null, notes: form.notes||null,
      purpose: form.purpose||null, status: 'active'
    })
    if (err) { setError(err.message); setSaving(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    const agent = agents.find(a => a.id === form.agent_id)
    await supabase.from('notifications').insert({
      user_id: user.id, title: 'Loan Issued',
      message: `৳${Number.parseFloat(form.amount).toLocaleString()} loan issued to ${agent?.full_name || 'agent'}`,
      type: 'warning', is_read: false,
    })
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[82vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">Issue Loan</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <div className="p-5 pb-24 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Agent *</span>
            <select value={form.agent_id} onChange={e=>set('agent_id',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="">— Select Agent —</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Amount (৳) *</span>
            <input type="number" min="0" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Issued Date</span>
              <input type="date" value={form.issued_date} onChange={e=>set('issued_date',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Due Date</span>
              <input type="date" value={form.due_date} onChange={e=>set('due_date',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Purpose</span>
            <input value={form.purpose} onChange={e=>set('purpose',e.target.value)} placeholder="Reason for loan" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <button onClick={handleSave} disabled={saving} className="w-full bg-gradient-to-r from-violet-500 to-purple-600 text-white py-3 rounded-xl font-bold text-sm mt-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Issue Loan'}
          </button>
        </div>
      </div>
    </div>
  )
}

AddLoanModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

function RepayModal({ loan, onClose, onSaved }) {
  const [amount, setAmount] = useState(String(Number.parseFloat(loan.balance || 0)))
  const [date, setDate] = useState(new Date().toISOString().slice(0,10))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const remaining = Number.parseFloat(loan.balance || 0)

  async function handleRepay() {
    const amt = Number.parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (amt > remaining + 0.01) { setError(`Max repayment is ৳${remaining.toLocaleString()}`); return }
    setSaving(true)
    const { error: err } = await supabase.from('loan_repayments').insert({ loan_id: loan.id, amount: amt, paid_date: date, note: note || null })
    if (err) { setError(err.message); setSaving(false); return }
    const { data: reps } = await supabase.from('loan_repayments').select('amount').eq('loan_id', loan.id)
    const paid = (reps || []).reduce((s, r) => s + Number.parseFloat(r.amount), 0)
    const newBalance = Math.max(0, Number.parseFloat(loan.amount) - paid)
    await supabase.from('loans').update({ status: newBalance <= 0 ? 'repaid' : 'partial', balance: newBalance }).eq('id', loan.id)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-slate-100 font-bold text-lg">Record Repayment</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <div className="p-5 pb-24 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Loan Total</span><span className="text-white font-bold">৳{Number.parseFloat(loan.amount).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Remaining</span><span className="text-amber-400 font-bold">৳{remaining.toLocaleString()}</span>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Repayment Amount (৳)</span>
            <input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Date</span>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Note</span>
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <button onClick={handleRepay} disabled={saving} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Record Repayment'}
          </button>
        </div>
      </div>
    </div>
  )
}

RepayModal.propTypes = {
  loan: PropTypes.shape({
    id: PropTypes.string.isRequired,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    balance: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

export default function Loans() {
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [repaying, setRepaying] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [repayments, setRepayments] = useState({})

  useEffect(() => { fetchLoans() }, [])

  async function fetchLoans() {
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('loans').select('*, agents(id, full_name)')
        .order('created_at', { ascending: false })
      if (err) throw err
      setLoans(data || [])
    } catch {
      setError('Failed to load loans. Tap refresh to try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await fetchLoans()
    setRefreshing(false)
  }

  async function toggleExpand(loanId) {
    if (expanded === loanId) { setExpanded(null); return }
    setExpanded(loanId)
    if (!repayments[loanId]) {
      const { data } = await supabase.from('loan_repayments').select('*').eq('loan_id', loanId).order('paid_date', { ascending: false })
      setRepayments(prev => ({ ...prev, [loanId]: data || [] }))
    }
  }

  const totalOutstanding = loans
    .filter(l => l.status === 'active' || l.status === 'partial')
    .reduce((s, l) => s + Number.parseFloat(l.balance || 0), 0)

  const filtered = filter === 'all' ? loans : loans.filter(l => l.status === filter)

  const counts = {
    active:  loans.filter(l => l.status === 'active').length,
    partial: loans.filter(l => l.status === 'partial').length,
    repaid:  loans.filter(l => l.status === 'repaid').length,
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-slate-100">Loans</h1><p className="text-slate-500 text-sm">{loans.length} loans</p></div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg"><Plus size={16}/> Issue</button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Outstanding Balance</p>
        <p className="text-xl font-extrabold text-violet-400">৳{totalOutstanding.toLocaleString()}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setFilter('all')} className={`flex-none px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${filter === 'all' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
          All ({loans.length})
        </button>
        {[['active','Active'],['partial','Partial'],['repaid','Repaid']].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} className={`flex-none px-4 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${filter === key ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {label} {counts[key] > 0 ? `(${counts[key]})` : ''}
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
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"/></div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? <p className="text-center text-slate-600 py-12 text-sm">No {filter !== 'all' ? filter : ''} loans</p> : (
            <ul>{filtered.map((l, i) => {
              const amount = Number.parseFloat(l.amount || 0)
              const balance = Number.parseFloat(l.balance ?? l.amount ?? 0)
              const paid = amount - balance
              const pct = amount > 0 ? Math.min(100, (paid / amount) * 100) : 0
              const isExpanded = expanded === l.id
              const loanRepayments = repayments[l.id] || []
              return (
                <li key={l.id} className={`${i < filtered.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <div className="px-4 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-slate-200 text-sm font-semibold">{l.agents?.full_name || '—'}</p>
                        <p className="text-slate-500 text-xs">
                          {l.issued_date ? new Date(l.issued_date).toLocaleDateString() : '—'}
                          {l.due_date ? ' · Due: ' + new Date(l.due_date).toLocaleDateString() : ''}
                        </p>
                        {l.purpose && <p className="text-slate-600 text-xs mt-0.5">{l.purpose}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <p className="text-white font-bold text-sm">৳{amount.toLocaleString()}</p>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLOR[l.status] || 'bg-slate-700 text-slate-300'}`}>{l.status}</span>
                      </div>
                    </div>
                    {l.status !== 'repaid' && (
                      <div className="mb-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-emerald-400">Paid ৳{paid.toLocaleString()}</span>
                          <span className="text-slate-500">Remaining ৳{balance.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}/>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <button onClick={() => toggleExpand(l.id)} className="flex items-center gap-1 text-slate-500 text-xs font-semibold">
                        {isExpanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                        {isExpanded ? 'Hide' : 'History'}
                      </button>
                      {l.status !== 'repaid' && (
                        <button onClick={() => setRepaying(l)} className="text-xs bg-emerald-500/15 text-emerald-400 px-3 py-1 rounded-full font-semibold">
                          + Repay
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-slate-800 bg-slate-950">
                      {loanRepayments.length === 0 ? (
                        <p className="text-slate-600 text-xs text-center py-4">No repayments yet</p>
                      ) : loanRepayments.map((r, ri) => (
                        <div key={r.id} className={`flex items-center justify-between px-4 py-3 ${ri < loanRepayments.length - 1 ? 'border-b border-slate-800' : ''}`}>
                          <div>
                            <p className="text-slate-300 text-xs font-semibold">{new Date(r.paid_date).toLocaleDateString()}</p>
                            {r.note && <p className="text-slate-600 text-xs">{r.note}</p>}
                          </div>
                          <p className="text-emerald-400 text-sm font-bold">৳{Number.parseFloat(r.amount).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}</ul>
          )}
        </div>
      )}
      {showAdd && <AddLoanModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchLoans() }}/>}
      {repaying && <RepayModal loan={repaying} onClose={() => setRepaying(null)} onSaved={() => { setRepaying(null); fetchLoans() }}/>}
    </div>
  )
}
