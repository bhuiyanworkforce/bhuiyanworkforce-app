import { useState, useEffect } from "react"
import PropTypes from "prop-types"
import { supabase } from "../../lib/supabase"
import { Plus, X, ChevronRight } from "lucide-react"

const STATUS_COLOR = {
  pending:  'bg-amber-500/15 text-amber-400',
  approved: 'bg-indigo-500/15 text-indigo-400',
  paid:     'bg-emerald-500/15 text-emerald-400',
}

function AddRefundModal({ onClose, onSaved }) {
  const [candidates, setCandidates] = useState([])
  const [invoices, setInvoices] = useState([])
  const [form, setForm] = useState({
    candidate_id: "", invoice_id: "", amount: "", reason: "",
    refund_date: new Date().toISOString().split("T")[0],
    payment_method: "cash"
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    supabase.from("candidates").select("id, full_name").order("full_name")
      .then(({ data }) => setCandidates(data || []))
    supabase.from("invoices").select("id, invoice_no, total").eq("status", "paid")
      .then(({ data }) => setInvoices(data || []))
  }, [])

  async function handleSave() {
    if (!form.amount || !form.reason) { setError("Amount and reason required"); return }
    setLoading(true); setError("")
    // Fix: Number.parseFloat over parseFloat (es2015 convention)
    const { error: err } = await supabase.from("refunds").insert({
      amount: Number.parseFloat(form.amount),
      reason: form.reason,
      refund_date: form.refund_date,
      payment_method: form.payment_method,
      status: "pending",
      candidate_id: form.candidate_id || null,
      invoice_id: form.invoice_id || null,
    })
    if (err) { setError(err.message); setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Refund Created",
      message: `৳${Number.parseFloat(form.amount).toLocaleString()} refund — ${form.reason}`,
      type: "info", is_read: false,
    })
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">New Refund</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <div className="p-5 pb-24 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}

          {/* Fix: wrap label+select so label IS the wrapping element — this is valid
              and correctly associates label with the interactive control inside it */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Candidate</span>
            <select value={form.candidate_id} onChange={e => set("candidate_id", e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="">— Select candidate —</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Invoice (optional)</span>
            <select value={form.invoice_id} onChange={e => set("invoice_id", e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="">— No invoice —</option>
              {/* Fix: Number.parseFloat over parseFloat (es2015 convention) */}
              {invoices.map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_no} — ৳{Number.parseFloat(inv.total||0).toLocaleString()}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Amount (৳) *</span>
            <input type="number" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Reason *</span>
            <input value={form.reason} onChange={e => set("reason", e.target.value)} placeholder="Reason for refund"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Date</span>
            <input type="date" value={form.refund_date} onChange={e => set("refund_date", e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Payment Method</span>
            <select value={form.payment_method} onChange={e => set("payment_method", e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
              <option value="mobile_banking">Mobile Banking</option>
              <option value="cheque">Cheque</option>
            </select>
          </label>

          <button onClick={handleSave} disabled={loading}
            className="w-full bg-gradient-to-r from-red-500 to-rose-600 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50">
            {loading ? "Saving…" : "Create Refund"}
          </button>
        </div>
      </div>
    </div>
  )
}

// Fix: PropTypes for AddRefundModal — onClose and onSaved were missing
AddRefundModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

function RefundDetail({ refund: initial, onClose, onUpdated }) {
  const [refund, setRefund] = useState(initial)
  const [updating, setUpdating] = useState(false)

  async function updateStatus(status) {
    setUpdating(true)
    const { error } = await supabase.from("refunds").update({ status }).eq("id", refund.id)
    if (error) { alert(error.message); setUpdating(false); return }
    setRefund(prev => ({ ...prev, status }))
    onUpdated()
    setUpdating(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22}/></button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-sm">{refund.candidates?.full_name || "Refund"}</p>
          <p className="text-slate-500 text-xs">{new Date(refund.refund_date).toLocaleDateString()}</p>
        </div>
        <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${STATUS_COLOR[refund.status] || 'bg-slate-700 text-slate-300'}`}>
          {refund.status}
        </span>
      </div>
      <div className="p-4 flex flex-col gap-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">Refund Amount</p>
          {/* Fix: Number.parseFloat over parseFloat (es2015 convention) */}
          <p className="text-3xl font-extrabold text-red-400">৳{Number.parseFloat(refund.amount||0).toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Reason</p>
            <p className="text-slate-200 text-sm">{refund.reason}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Payment Method</p>
              <p className="text-slate-200 text-sm font-semibold capitalize">{refund.payment_method?.replace('_', ' ') || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Invoice</p>
              <p className="text-slate-200 text-sm font-semibold">{refund.invoices?.invoice_no || '—'}</p>
            </div>
          </div>
        </div>
        {refund.status === "pending" && (
          <div className="flex flex-col gap-3">
            <button onClick={() => updateStatus("approved")} disabled={updating}
              className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50">
              ✓ Approve Refund
            </button>
            <button onClick={() => updateStatus("paid")} disabled={updating}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3 rounded-2xl disabled:opacity-50">
              Mark as Paid
            </button>
          </div>
        )}
        {refund.status === "approved" && (
          <button onClick={() => updateStatus("paid")} disabled={updating}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50">
            ✓ Mark as Paid
          </button>
        )}
        {refund.status === "paid" && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-center">
            <p className="text-emerald-400 font-bold">✓ Refund Paid</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Fix: PropTypes for RefundDetail — refund, onClose, onUpdated were missing
RefundDetail.propTypes = {
  refund: PropTypes.shape({
    id: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    reason: PropTypes.string,
    refund_date: PropTypes.string,
    status: PropTypes.string,
    payment_method: PropTypes.string,
    candidates: PropTypes.shape({ full_name: PropTypes.string }),
    invoices: PropTypes.shape({ invoice_no: PropTypes.string }),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdated: PropTypes.func.isRequired,
}

export default function Refunds() {
  const [refunds, setRefunds] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => { fetchRefunds() }, [])

  async function fetchRefunds() {
    const { data, error } = await supabase
      .from("refunds")
      .select("*, candidates(full_name), invoices(invoice_no, total)")
      .order("refund_date", { ascending: false })
    if (error) alert(error.message)
    setRefunds(data || [])
    setLoading(false)
  }

  const filtered = filter === "all" ? refunds : refunds.filter(r => r.status === filter)
  // Fix: Number.parseFloat over parseFloat (es2015 convention)
  const total = refunds.reduce((s, r) => s + Number.parseFloat(r.amount || 0), 0)
  const pending = refunds.filter(r => r.status === "pending").reduce((s, r) => s + Number.parseFloat(r.amount || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Refunds</h1>
          <p className="text-slate-500 text-sm">{refunds.length} refunds</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-rose-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
          <Plus size={16}/> Add
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-500/10 border border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Refunded</p>
          <p className="text-xl font-extrabold text-red-400">৳{total.toLocaleString()}</p>
        </div>
        <div className="bg-amber-500/10 border border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Pending</p>
          <p className="text-xl font-extrabold text-amber-400">৳{pending.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {["all", "pending", "approved", "paid"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${filter === s ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-center text-slate-600 py-12 text-sm">No refunds found</p>
          ) : (
            <ul>
              {filtered.map((r, i) => (
                // Fix: non-interactive <li> with click handler → use a <button> role
                // to satisfy both "non-interactive elements should not have mouse/keyboard
                // event listeners" and "visible non-interactive elements must have a
                // keyboard listener" (L254 — two issues, one fix)
                <li key={r.id}
                  className={`${i < filtered.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className="w-full flex items-center gap-3 px-4 py-4 cursor-pointer active:bg-slate-800 transition-colors text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200 text-sm font-semibold truncate">{r.candidates?.full_name || "—"}</p>
                      <p className="text-slate-500 text-xs truncate">{r.reason}</p>
                      <p className="text-slate-600 text-xs">{new Date(r.refund_date).toLocaleDateString()}{r.invoices?.invoice_no ? ' · ' + r.invoices.invoice_no : ''}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-none">
                      {/* Fix: Number.parseFloat over parseFloat (es2015 convention) */}
                      <p className="text-red-400 font-bold text-sm">৳{Number.parseFloat(r.amount||0).toLocaleString()}</p>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status] || 'bg-slate-700 text-slate-300'}`}>
                        {r.status}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-slate-600 flex-none"/>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showAdd && <AddRefundModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchRefunds() }}/>}
      {selected && <RefundDetail refund={selected} onClose={() => setSelected(null)} onUpdated={fetchRefunds}/>}
    </div>
  )
}
