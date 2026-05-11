import PropTypes from 'prop-types'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, X } from 'lucide-react'
import { calcAgentNet } from '../../lib/utils'
import { Spinner } from '../../components/Skeleton'

const PAGE_SIZE = 20

// ─── Add Modal ────────────────────────────────────────────────────────────────

export function AddAgentPayrollModal({ onClose, onSaved }) {
  const [agents, setAgents] = useState([])
  const [form, setForm] = useState({
    agent_id: '', period_start: '', period_end: '',
    base_amount: '', commission_amount: '0', allowance: '0',
    overtime: '0', bonus: '0', deductions: '0',
    payment_method: 'cash', status: 'pending',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    supabase.from('agents').select('id, full_name').order('full_name')
      .then(({ data }) => setAgents(data || []))
  }, [])

  async function handleSave() {
    if (!form.agent_id || !form.period_start || !form.base_amount) {
      setError('Agent, period start and base amount are required'); return
    }
    setSaving(true)
    const net_amount = calcAgentNet(form)
    const { error: err } = await supabase.from('payroll').insert({
      agent_id: form.agent_id,
      period_start: form.period_start,
      period_end: form.period_end || null,
      base_amount:       Number(form.base_amount)       || 0,
      commission_amount: Number(form.commission_amount) || 0,
      allowance:         Number(form.allowance)         || 0,
      overtime:          Number(form.overtime)          || 0,
      bonus:             Number(form.bonus)             || 0,
      deductions:        Number(form.deductions)        || 0,
      net_amount,
      net_salary: net_amount,
      payment_method: form.payment_method,
      status: form.status,
      paid_at: form.status === 'paid' ? new Date().toISOString() : null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  const net = calcAgentNet(form)

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">Add Agent Payroll</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <div className="p-5 pb-24 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Agent *</span>
            <select value={form.agent_id} onChange={e => set('agent_id', e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="">— Select Agent —</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Period Start *</span>
              <input type="date" value={form.period_start} onChange={e => set('period_start', e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Period End</span>
              <input type="date" value={form.period_end} onChange={e => set('period_end', e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </label>
          </div>
          {[['Base Amount (৳) *','base_amount'],['Commission (৳)','commission_amount'],['Allowance (৳)','allowance'],['Overtime (৳)','overtime'],['Bonus (৳)','bonus'],['Deductions (৳)','deductions']].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">{label}</span>
              <input type="number" min="0" value={form[field]} onChange={e => set(field, e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Payment Method</span>
            <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
              <option value="mobile_banking">Mobile Banking</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Status</span>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          <div className="bg-indigo-500/10 rounded-xl p-3 text-center">
            <p className="text-xs text-slate-500">Net Amount</p>
            <p className="text-lg font-extrabold text-indigo-400">৳{net.toLocaleString()}</p>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Payroll'}
          </button>
        </div>
      </div>
    </div>
  )
}

AddAgentPayrollModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

// ─── Detail View ──────────────────────────────────────────────────────────────

export function AgentPayrollDetail({ record, onClose, onUpdated }) {
  const [updating, setUpdating] = useState(false)

  async function markPaid() {
    setUpdating(true)
    await supabase.from('payroll').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', record.id)
    const net = Number(record.net_amount || record.net_salary) || 0
    await supabase.from('expenses').insert({
      date: new Date().toISOString().split('T')[0],
      category: 'salary',
      description: `Agent payroll — ${record.agents?.full_name || 'agent'}`,
      amount: net,
      payment_method: record.payment_method || 'cash',
    })
    onUpdated()
    setUpdating(false)
    onClose()
  }

  const net = record.net_amount || record.net_salary || 0

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22}/></button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-sm">{record.agents?.full_name}</p>
          <p className="text-slate-500 text-xs">
            {record.period_start ? new Date(record.period_start).toLocaleDateString() : '—'}
            {record.period_end ? ' → ' + new Date(record.period_end).toLocaleDateString() : ''}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-bold ${record.status === 'paid' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
          {record.status}
        </span>
      </div>
      <div className="p-4 flex flex-col gap-4">
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 text-center">
          <p className="text-xs text-slate-500">Net Amount</p>
          <p className="text-3xl font-extrabold text-indigo-400">৳{(Number(net) || 0).toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          {[['Base', record.base_amount],['Commission', record.commission_amount],['Allowance', record.allowance],['Overtime', record.overtime],['Bonus', record.bonus],['Deductions', record.deductions]].map(([label, val]) => (
            <div key={label}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
              <p className={`text-sm font-semibold ${label === 'Deductions' ? 'text-red-400' : 'text-slate-200'}`}>
                ৳{(Number(val) || 0).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Payment Method</p>
            <p className="text-slate-200 text-sm font-semibold capitalize">{record.payment_method || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Paid At</p>
            <p className="text-slate-200 text-sm font-semibold">{record.paid_at ? new Date(record.paid_at).toLocaleDateString() : '—'}</p>
          </div>
        </div>
        {record.status === 'pending' && (
          <button onClick={markPaid} disabled={updating}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50">
            {updating ? 'Updating…' : '✓ Mark as Paid'}
          </button>
        )}
      </div>
    </div>
  )
}

AgentPayrollDetail.propTypes = {
  record: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    net_amount: PropTypes.number,
    net_salary: PropTypes.number,
    agents: PropTypes.shape({ full_name: PropTypes.string }),
    period_start: PropTypes.string,
    period_end: PropTypes.string,
    status: PropTypes.string,
    base_amount: PropTypes.number,
    commission_amount: PropTypes.number,
    allowance: PropTypes.number,
    overtime: PropTypes.number,
    bonus: PropTypes.number,
    deductions: PropTypes.number,
    payment_method: PropTypes.string,
    paid_at: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdated: PropTypes.func.isRequired,
}

// ─── Agent Payroll Tab ────────────────────────────────────────────────────────

export default function AgentPayrollTab() {
  const [payrolls, setPayrolls]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset]           = useState(0)
  const [total, setTotal]             = useState(0)
  const [hasMore, setHasMore]         = useState(false)
  const [filter, setFilter]           = useState('all')
  const [showAdd, setShowAdd]         = useState(false)
  const [selected, setSelected]       = useState(null)

  const fetchPayrolls = useCallback(async (newOffset = 0, statusFilter = filter) => {
    if (newOffset === 0) setLoading(true); else setLoadingMore(true)
    try {
      let q = supabase
        .from('payroll')
        .select('*, agents(full_name)', { count: 'exact' })
        .order('period_start', { ascending: false })
        .range(newOffset, newOffset + PAGE_SIZE - 1)
      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      const { data, error, count } = await q
      if (error) throw error
      const rows = data || []
      setPayrolls(prev => newOffset === 0 ? rows : [...prev, ...rows])
      setTotal(count || 0)
      setOffset(newOffset)
      setHasMore(newOffset + PAGE_SIZE < (count || 0))
    } catch (err) {
      console.error('[AgentPayroll] fetch failed:', err)
      if (newOffset === 0) setPayrolls([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filter])

  useEffect(() => { fetchPayrolls(0) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleFilter(f) { setFilter(f); fetchPayrolls(0, f) }

  const pending = payrolls.filter(p => p.status === 'pending').reduce((s, p) => s + (Number(p.net_amount || p.net_salary) || 0), 0)
  const paid    = payrolls.filter(p => p.status === 'paid').reduce((s, p) => s + (Number(p.net_amount || p.net_salary) || 0), 0)

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-slate-500 text-sm">{total} records</p>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
          <Plus size={16}/> Add
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-500/10 border border-slate-800 rounded-2xl p-3">
          <p className="text-xs text-slate-500 font-semibold">Pending</p>
          <p className="text-lg font-extrabold text-amber-400">৳{pending.toLocaleString()}</p>
        </div>
        <div className="bg-emerald-500/10 border border-slate-800 rounded-2xl p-3">
          <p className="text-xs text-slate-500 font-semibold">Paid</p>
          <p className="text-lg font-extrabold text-emerald-400">৳{paid.toLocaleString()}</p>
        </div>
      </div>
      <div className="flex gap-2">
        {['all','pending','paid'].map(s => (
          <button key={s} onClick={() => handleFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize ${filter === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {s}
          </button>
        ))}
      </div>
      {loading ? <Spinner /> : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {payrolls.length === 0
              ? <p className="text-center text-slate-600 py-12 text-sm">No payroll records</p>
              : <ul>{payrolls.map((p, i) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setSelected(p)}
                      className={`w-full text-left px-4 py-4 active:bg-slate-800 transition-colors ${i < payrolls.length - 1 ? 'border-b border-slate-800' : ''}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-slate-200 text-sm font-semibold">{p.agents?.full_name || '—'}</p>
                          <p className="text-slate-500 text-xs">
                            {p.period_start ? new Date(p.period_start).toLocaleDateString() : '—'}
                            {p.period_end ? ' → ' + new Date(p.period_end).toLocaleDateString() : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <p className="text-white font-bold text-sm">৳{(Number(p.net_amount || p.net_salary) || 0).toLocaleString()}</p>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${p.status === 'paid' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                            {p.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}</ul>
            }
          </div>
          {hasMore && (
            <button onClick={() => fetchPayrolls(offset + PAGE_SIZE)} disabled={loadingMore}
              className="w-full py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold disabled:opacity-50">
              {loadingMore ? 'Loading…' : `Load More (${total - payrolls.length} remaining)`}
            </button>
          )}
        </>
      )}
      {showAdd && <AddAgentPayrollModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchPayrolls(0) }}/>}
      {selected && <AgentPayrollDetail record={selected} onClose={() => setSelected(null)} onUpdated={() => { fetchPayrolls(0); setSelected(null) }}/>}
    </>
  )
}
