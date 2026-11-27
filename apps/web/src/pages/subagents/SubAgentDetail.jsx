import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { safeDelete } from '../../lib/utils'
import { X, Users, Wallet, TrendingUp, FileText, Plus, Trash2 } from 'lucide-react'
import VoucherButton from '../../components/VoucherButton'

export default function SubAgentDetail({ subAgent, onClose }) {
  const [candidates, setCandidates] = useState([])
  const [invoices, setInvoices] = useState([])
  const [payouts, setPayouts] = useState([])
  const [showPayout, setShowPayout] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // ── Login account link (lets this sub agent sign in and see ONLY their candidates)
  const [linkedId, setLinkedId]       = useState(subAgent.profile_id || null)
  const [loginProfiles, setLoginProfiles] = useState([])
  const [takenIds, setTakenIds]       = useState([])
  const [pickId, setPickId]           = useState('')
  const [linkBusy, setLinkBusy]       = useState(false)
  const [linkMsg, setLinkMsg]         = useState('')

  async function fetchLogins() {
    const [{ data: profs }, { data: linked }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('role', 'agent').order('full_name'),
      supabase.from('sub_agents').select('profile_id').not('profile_id', 'is', null),
    ])
    setLoginProfiles(profs || [])
    setTakenIds((linked || []).map(r => r.profile_id))
  }

  async function saveLink(profileId) {
    setLinkBusy(true)
    setLinkMsg('')
    const { error } = await supabase.from('sub_agents').update({ profile_id: profileId }).eq('id', subAgent.id)
    if (error) {
      setLinkMsg(error.message.includes('duplicate')
        ? 'That login is already linked to another sub agent.'
        : `Could not save: ${error.message}`)
    } else {
      setLinkedId(profileId)
      setPickId('')
      await fetchLogins()
    }
    setLinkBusy(false)
  }

  async function handleDelete() {
    const result = await safeDelete(supabase, 'sub_agents', 'id', subAgent.id)
    if (!result.ok) { alert(result.message); return }
    onClose()
  }
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutNotes, setPayoutNotes] = useState('')
  const [payoutMethod, setPayoutMethod] = useState('cash')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData(); fetchLogins() }, [])

  async function fetchData() {
    const [{ data: cands }, { data: invs }, { data: pays }] = await Promise.all([
      supabase.from('candidates').select('*').eq('sub_agent_id', subAgent.id).is('archived_at', null).order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').eq('sub_agent_id', subAgent.id).order('issued_at', { ascending: false }),
      supabase.from('sub_agent_payouts').select('*').eq('sub_agent_id', subAgent.id).order('paid_at', { ascending: false }),
    ])
    setCandidates(cands || [])
    setInvoices(invs || [])
    setPayouts(pays || [])
  }

  async function recordPayout() {
    if (!payoutAmount || Number.isNaN(Number(payoutAmount))) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) {
      alert('Your session has expired. Please log in again.')
      setSaving(false)
      return
    }
    // Fix: this insert's result was never checked — a failed payout
    // record (RLS hiccup, network blip) would close the panel as if the
    // payout had been recorded, with no financial trail actually saved.
    const { error } = await supabase.from('sub_agent_payouts').insert({
      sub_agent_id: subAgent.id,
      amount: Number.parseFloat(payoutAmount),
      notes: payoutNotes || null,
      payment_method: payoutMethod,
      paid_by: user.id,
    })
    if (error) {
      alert(`Payout was not saved: ${error.message}`)
      setSaving(false)
      return
    }
    setPayoutAmount('')
    setPayoutNotes('')
    setPayoutMethod('cash')
    setShowPayout(false)
    setSaving(false)
    fetchData()
  }

  const paidTotal = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number.parseFloat(i.total || 0), 0)
  const commission = (paidTotal * (Number.parseFloat(subAgent.commission_rate) || 0)) / 100
  const unpaidTotal = invoices.filter(i => i.status === 'unpaid').reduce((s, i) => s + Number.parseFloat(i.total || 0), 0)
  const totalPaidOut = payouts.reduce((s, p) => s + Number.parseFloat(p.amount || 0), 0)
  const commissionOwed = commission - totalPaidOut

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22} /></button>
        <div className="flex-1">
          <p className="text-slate-100 font-bold text-sm">{subAgent.full_name}</p>
          <p className="text-slate-500 text-xs">{subAgent.commission_rate}% commission · {subAgent.phone}</p>
        </div>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-500 px-2 py-1">Cancel</button>
            <button onClick={handleDelete} className="flex items-center gap-1 bg-red-500/20 text-red-400 px-3 py-1.5 rounded-xl text-xs font-semibold">
              <Trash2 size={13}/> Confirm
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-slate-600 hover:text-red-400 transition-colors p-1.5">
            <Trash2 size={16}/>
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          {[
            { label: 'Company', value: subAgent.company || '—' },
            { label: 'Email',   value: subAgent.email   || '—' },
            { label: 'Phone',   value: subAgent.phone   || '—' },
            { label: 'Commission', value: subAgent.commission_rate + '%' },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{f.label}</p>
              <p className="text-slate-200 text-sm font-semibold truncate">{f.value}</p>
            </div>
          ))}
        </div>

        {/* Login account: a linked sub agent signs in and sees only their own candidates */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-slate-300 mb-1">Login account</h3>
          <p className="text-slate-500 text-xs mb-3">
            Link a user with the Sub Agent role. They can sign in and see only their own candidates.
          </p>
          {linkMsg && <p className="text-red-400 text-xs mb-2">{linkMsg}</p>}
          {linkedId ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-emerald-400 text-sm font-semibold truncate">
                {loginProfiles.find(p => p.id === linkedId)?.full_name || 'Linked account'}
              </p>
              <button onClick={() => saveLink(null)} disabled={linkBusy}
                className="text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded-xl font-semibold disabled:opacity-50">
                Unlink
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select value={pickId} onChange={e => setPickId(e.target.value)}
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
                <option value="">Select a sub agent login…</option>
                {loginProfiles.filter(p => !takenIds.includes(p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</option>
                ))}
              </select>
              <button onClick={() => pickId && saveLink(pickId)} disabled={!pickId || linkBusy}
                className="bg-indigo-500 text-white text-sm font-bold px-4 rounded-xl disabled:opacity-40">
                Link
              </button>
            </div>
          )}
          {!linkedId && loginProfiles.filter(p => !takenIds.includes(p.id)).length === 0 && (
            <p className="text-slate-600 text-xs mt-2">
              No unlinked Sub Agent logins. Create one on the Users page (role: Sub Agent) first.
            </p>
          )}
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
              <input type="number" min="0" value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)}
                placeholder="Amount (৳)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100" />
              <select value={payoutMethod} onChange={e => setPayoutMethod(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100">
                <option value="cash">Cash</option>
                <option value="bank">Bank transfer</option>
                <option value="mobile">Mobile banking</option>
              </select>
              <p className="text-[11px] text-slate-500">Recording a payout adds it to Expenses automatically and creates a voucher.</p>
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
                  <VoucherButton sourceType="sub_agent_payout" sourceId={p.id} compact />
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

SubAgentDetail.propTypes = {
  subAgent: PropTypes.shape({
    id: PropTypes.string.isRequired,
    full_name: PropTypes.string.isRequired,
    commission_rate: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    phone: PropTypes.string,
    email: PropTypes.string,
    company: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
}
