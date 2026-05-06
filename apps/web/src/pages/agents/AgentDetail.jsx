import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { X, Users, Wallet, TrendingUp, FileText, Plus } from 'lucide-react'
import PropTypes from 'prop-types'

export default function AgentDetail({ agent, onClose }) {
  const [candidates, setCandidates] = useState([])
  const [invoices, setInvoices] = useState([])
  const [payouts, setPayouts] = useState([])
  const [showPayout, setShowPayout] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutNotes, setPayoutNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: cands }, { data: invs }, { data: pays }] = await Promise.all([
      supabase.from('candidates').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').eq('agent_id', agent.id).order('issued_at', { ascending: false }),
      supabase.from('agent_payouts').select('*').eq('agent_id', agent.id).order('paid_at', { ascending: false }),
    ])
    setCandidates(cands || [])
    setInvoices(invs || [])
    setPayouts(pays || [])
  }

  async function recordPayout() {
    if (!payoutAmount || Number.isNaN(Number(payoutAmount))) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('agent_payouts').insert({
      agent_id: agent.id,
      amount: Number.parseFloat(payoutAmount),
      notes: payoutNotes || null,
      paid_by: user.id,
    })
    setPayoutAmount('')
    setPayoutNotes('')
    setShowPayout(false)
    setSaving(false)
    fetchData()
  }

  const paidTotal = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number.parseFloat(i.total || 0), 0)
  const commission = (paidTotal * (Number.parseFloat(agent.commission_rate) || 0)) / 100
  const unpaidTotal = invoices.filter(i => i.status === 'unpaid').reduce((s, i) => s + Number.parseFloat(i.total || 0), 0)
  const totalPaidOut = payouts.reduce((s, p) => s + Number.parseFloat(p.amount || 0), 0)
  const commissionOwed = commission - totalPaidOut

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22} /></button>
        <div className="flex-1">
          <p className="text-slate-100 font-bold text-sm">{agent.full_name}</p>
          <p className="text-slate-500 text-xs">{agent.commission_rate}% commission · {agent.phone}</p>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          {[
            { label: 'Company', value: agent.company || '—' },
            { label: 'Email',   value: agent.email   || '—' },
            { label: 'Phone',   value: agent.phone   || '—' },
            { label: 'Commission', value: agent.commission_rate + '%' },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{f.label}</p>
              <p className="text-slate-200 text-sm font-semibold truncate">{f.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Candidates',   value: candidates.length,                  icon: Users,      color: 'text-indigo-400',  bg: 'bg-indigo-500/15'  },
            { label: 'Revenue',      value: '৳' + paidTotal.toLocaleString(),   icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
            { label: 'Commission',   value: '৳' + commission.toLocaleString(),  icon: Wallet,     color: 'text-pink-400',    bg: 'bg-pink-500/15'    },
            { label: 'Outstanding',  value: '৳' + unpaidTotal.toLocaleString(), icon: FileText,   color: 'text-amber-400',   bg: 'bg-amber-500/15'   },
          ].map(s => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mb-2`}>
                <s.icon size={15} className={s.color} />
              </div>
              <p className={`text-lg font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Commission & Payout Summary */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-slate-300 mb-3">Commission Summary</h3>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total Commission Due</span>
              <span className="text-slate-200 font-semibold">৳{commission.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total Paid Out</span>
              <span className="text-emerald-400 font-semibold">৳{totalPaidOut.toLocaleString()}</span>
            </div>
            <div className="h-px bg-slate-800 my-1" />
            <div className="flex justify-between">
              <span className={`font-bold ${commissionOwed > 0 ? 'text-pink-400' : 'text-emerald-400'}`}>
                {commissionOwed > 0 ? 'Still Owed' : 'Fully Paid'}
              </span>
              <span className={`font-extrabold text-lg ${commissionOwed > 0 ? 'text-pink-400' : 'text-emerald-400'}`}>
                ৳{Math.abs(commissionOwed).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Record Payout */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-300">Payout History ({payouts.length})</h3>
            <button onClick={() => setShowPayout(!showPayout)}
              className="flex items-center gap-1 text-indigo-400 text-xs font-bold">
              <Plus size={14}/> Record
            </button>
          </div>
          {showPayout && (
            <div className="p-4 border-b border-slate-800 flex flex-col gap-3">
              <input type="number" value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)}
                placeholder="Amount (৳)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100" />
              <input value={payoutNotes} onChange={e => setPayoutNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100" />
              <button onClick={recordPayout} disabled={saving}
                className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl disabled:opacity-50">
                {saving ? 'Saving...' : 'Record Payout'}
              </button>
            </div>
          )}
          {payouts.length === 0 ? (
            <p className="text-center text-slate-600 py-8 text-sm">No payouts recorded</p>
          ) : (
            <ul>
              {payouts.map((p, i) => (
                <li key={p.id} className={`flex items-center justify-between px-4 py-3 ${i < payouts.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <div>
                    <p className="text-emerald-400 font-bold text-sm">৳{Number.parseFloat(p.amount).toLocaleString()}</p>
                    <p className="text-slate-500 text-xs">{new Date(p.paid_at).toLocaleDateString()}</p>
                    {p.notes && <p className="text-slate-400 text-xs">{p.notes}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Candidates */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-slate-300">Candidates ({candidates.length})</h3>
          </div>
          {candidates.length === 0 ? (
            <p className="text-center text-slate-600 py-8 text-sm">No candidates assigned</p>
          ) : (
            <ul>
              {candidates.map((c, i) => (
                <li key={c.id} className={`flex items-center gap-3 px-4 py-3 ${i < candidates.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-indigo-500/15 flex items-center justify-center text-indigo-400 font-bold text-sm flex-none">
                    {c.full_name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-slate-200 text-sm font-semibold">{c.full_name}</p>
                    <p className="text-slate-500 text-xs">{c.phone}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

AgentDetail.propTypes = {
  agent: PropTypes.shape({
    id: PropTypes.string.isRequired,
    full_name: PropTypes.string.isRequired,
    commission_rate: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    phone: PropTypes.string,
    email: PropTypes.string,
    company: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
}
