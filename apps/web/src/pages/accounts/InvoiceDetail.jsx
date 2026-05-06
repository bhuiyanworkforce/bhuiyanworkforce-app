import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { supabase } from '../../lib/supabase'
import { X, Download, CheckCircle, Pencil, XCircle, Plus } from 'lucide-react'

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'bkash', 'nagad', 'other']

const STATUS_COLOR = {
  unpaid:    'bg-red-500/15 text-red-400',
  partial:   'bg-amber-500/15 text-amber-400',
  paid:      'bg-emerald-500/15 text-emerald-400',
  cancelled: 'bg-slate-500/15 text-slate-400',
}

function buildItemRows(items) {
  return items.map(item => {
    const unitPrice = (Number.parseFloat(item.unit_price) || 0).toLocaleString()
    const total = (Number.parseFloat(item.total) || 0).toLocaleString()
    return `<tr><td>${item.description}</td><td>${item.quantity}</td><td>৳${unitPrice}</td><td>৳${total}</td></tr>`
  }).join('')
}

export default function InvoiceDetail({ invoice: initialInvoice, onClose, onUpdated }) {
  const [invoice, setInvoice] = useState(initialInvoice)
  const [items, setItems] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [editForm, setEditForm] = useState({ due_date: initialInvoice.due_date || '', notes: initialInvoice.notes || '' })
  const [editItems, setEditItems] = useState([])
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', notes: '' })
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: it }, { data: pay }] = await Promise.all([
        supabase.from('invoice_items').select('*').eq('invoice_id', invoice.id),
        supabase.from('payments').select('*').eq('invoice_id', invoice.id).order('created_at', { ascending: false }),
      ])
      setItems(it || [])
      setPayments(pay || [])
      setLoading(false)
    }
    load()
  }, [])

  const totalPaid = payments.reduce((s, p) => s + (Number.parseFloat(p.amount) || 0), 0)
  const remaining = (Number.parseFloat(invoice.total) || 0) - totalPaid

  async function recordPayment() {
    const amount = Number.parseFloat(payForm.amount)
    if (!amount || amount <= 0) return alert('Enter a valid amount')
    if (amount > remaining + 0.01) return alert(`Max payable is ৳${remaining.toLocaleString()}`)
    setPaying(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: pay, error } = await supabase.from('payments').insert({
      invoice_id: invoice.id,
      amount,
      method: payForm.method,
      notes: payForm.notes || null,
      received_by: user.id,
    }).select('receipt_no').single()
    if (error) { alert(error.message); setPaying(false); return }

    const newTotalPaid = totalPaid + amount
    const newStatus = newTotalPaid >= (Number.parseFloat(invoice.total) || 0) - 0.01 ? 'paid' : 'partial'
    await supabase.from('invoices').update({ status: newStatus, receipt_no: pay?.receipt_no || null }).eq('id', invoice.id)

    const remainingAfter = remaining - amount
    const partialMsg = newStatus === 'partial' ? `, ৳${remainingAfter.toLocaleString()} remaining` : ''
    await supabase.from('notifications').insert({
      user_id: user.id,
      title: newStatus === 'paid' ? 'Invoice Paid' : 'Partial Payment',
      message: `${invoice.invoice_no} — ৳${amount.toLocaleString()} received${partialMsg}`,
      type: 'success',
      is_read: false,
    })

    setPayments(prev => [{ ...payForm, amount, receipt_no: pay?.receipt_no, created_at: new Date().toISOString() }, ...prev])
    setInvoice(prev => ({ ...prev, status: newStatus, receipt_no: pay?.receipt_no || prev.receipt_no }))
    setShowPayment(false)
    setPayForm({ amount: '', method: 'cash', notes: '' })
    setPaying(false)
    onUpdated(newStatus, pay?.receipt_no)
  }

  async function saveEdit() {
    setSaving(true)
    const { error } = await supabase.from('invoices').update(editForm).eq('id', invoice.id)
    if (error) { alert(error.message); setSaving(false); return }
    await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id)
    const newItems = editItems.filter(i => i.description && i.quantity && i.unit_price).map(i => ({
      invoice_id: invoice.id,
      description: i.description,
      quantity: Number.parseFloat(i.quantity),
      unit_price: Number.parseFloat(i.unit_price),
      total: Number.parseFloat(i.quantity) * Number.parseFloat(i.unit_price)
    }))
    if (newItems.length) await supabase.from('invoice_items').insert(newItems)
    const newTotal = newItems.reduce((s, i) => s + i.total, 0)
    await supabase.from('invoices').update({ total: newTotal, subtotal: newTotal }).eq('id', invoice.id)
    setItems(newItems)
    setInvoice(prev => ({ ...prev, ...editForm, total: newTotal }))
    setShowEdit(false)
    setSaving(false)
  }

  async function cancelInvoice() {
    if (!cancelReason.trim()) return alert('Please enter a reason')
    setSaving(true)
    await supabase.from('invoices').update({
      status: 'cancelled',
      cancel_reason: cancelReason,
      cancelled_at: new Date().toISOString()
    }).eq('id', invoice.id)
    setInvoice(prev => ({ ...prev, status: 'cancelled', cancel_reason: cancelReason }))
    setShowCancel(false)
    setSaving(false)
    onUpdated('cancelled')
  }

  function buildPrintHtml() {
    const paidBg = invoice.status === 'paid' ? '#d1fae5' : '#fee2e2'
    const paidColor = invoice.status === 'paid' ? '#065f46' : '#991b1b'
    const dueLine = invoice.due_date ? `<p>Due: ${new Date(invoice.due_date).toLocaleDateString()}</p>` : ''
    const notesLine = invoice.notes ? `<p style="color:#666;font-size:13px;margin-bottom:20px;">Notes: ${invoice.notes}</p>` : ''
    const itemRows = buildItemRows(items)

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${invoice.invoice_no}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:40px;color:#1a1a2e}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;border-bottom:3px solid #6366f1;padding-bottom:20px}
      .company h1{font-size:24px;color:#6366f1;font-weight:900}.company p{color:#666;font-size:13px;margin-top:4px}
      .invoice-info{text-align:right}.invoice-info h2{font-size:20px;font-weight:800}
      .candidate{background:#f8f9ff;border-radius:12px;padding:16px;margin-bottom:30px}
      .candidate h3{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px}
      .candidate p{font-size:16px;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      th{background:#6366f1;color:white;padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase}
      td{padding:12px 16px;border-bottom:1px solid #eee;font-size:14px}
      .total-row td{background:#6366f1;color:white;font-weight:800;font-size:16px;border:none}
      .footer{margin-top:40px;text-align:center;color:#999;font-size:12px;border-top:1px solid #eee;padding-top:20px}
      .status{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;
      background:${paidBg};color:${paidColor}}
      </style></head><body>
      <div class="header"><div class="company"><h1>AgencyOS</h1><p>Bhuiyan Workforce Management</p><p>bhuiyanworkforce.com</p></div>
      <div class="invoice-info"><h2>${invoice.invoice_no}</h2><p>Date: ${new Date(invoice.issued_at).toLocaleDateString()}</p>
      ${dueLine}<br/><span class="status">${invoice.status}</span></div></div>
      <div class="candidate"><h3>Bill To</h3><p>${invoice.candidates?.full_name || 'N/A'}</p></div>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>
      ${itemRows}
      <tr class="total-row"><td colspan="3">Total Amount</td><td>৳${(Number.parseFloat(invoice.total)||0).toLocaleString()}</td></tr>
      </tbody></table>${notesLine}
      <div class="footer"><p>Thank you for your business — Bhuiyan Workforce Management</p></div></body></html>`
  }

  function addEditItem() {
    setEditItems(prev => [...prev, { description: '', quantity: '1', unit_price: '' }])
  }

  function removeEditItem(idx) {
    setEditItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateEditItem(idx, field, value) {
    setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function openPaymentModal() {
    setPayForm({ amount: String(remaining), method: 'cash', notes: '' })
    setShowPayment(true)
  }

  function openEditModal() {
    const mapped = items.map(i => ({
      description: i.description,
      quantity: String(i.quantity),
      unit_price: String(i.unit_price),
    }))
    setEditItems(mapped)
    setShowEdit(true)
  }

  function printInvoice() {
    const win = window.open('', '_blank')
    const blob = new Blob([buildPrintHtml()], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    win.location.href = url
    win.addEventListener('load', () => {
      win.print()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-2">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-sm">{invoice.invoice_no}</p>
          <p className="text-slate-500 text-xs">{invoice.candidates?.full_name}</p>
        </div>
        <button onClick={printInvoice} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-semibold">
          <Download size={13} /> PDF
        </button>
        {invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
          <button onClick={openEditModal} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-semibold">
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${STATUS_COLOR[invoice.status] || 'bg-slate-700 text-slate-300'}`}>{invoice.status}</span>
            <p className="text-slate-500 text-xs">{new Date(invoice.issued_at).toLocaleDateString()}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {invoice.due_date && (
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Due Date</p>
                <p className="text-slate-200 text-sm font-semibold">{new Date(invoice.due_date).toLocaleDateString()}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Total</p>
              <p className="text-indigo-400 text-lg font-extrabold">৳{(Number.parseFloat(invoice.total)||0).toLocaleString()}</p>
            </div>
          </div>
          {invoice.status !== 'cancelled' && (
            <div className="mt-1">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-emerald-400 font-semibold">Paid ৳{totalPaid.toLocaleString()}</span>
                <span className="text-slate-500">Remaining ৳{remaining.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (totalPaid / (Number.parseFloat(invoice.total) || 1)) * 100)}%` }} />
              </div>
            </div>
          )}
          {invoice.cancel_reason && (
            <div className="mt-3 bg-red-500/10 rounded-xl p-3">
              <p className="text-xs text-red-400 font-semibold">Cancel Reason: {invoice.cancel_reason}</p>
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-slate-300">Items</h3>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <ul>
              {items.map((item, i) => (
                <li key={item.id} className={`px-4 py-3 flex items-center justify-between ${i < items.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <div>
                    <p className="text-slate-200 text-sm font-semibold">{item.description}</p>
                    <p className="text-slate-500 text-xs">{item.quantity} × ৳{(Number.parseFloat(item.unit_price)||0).toLocaleString()}</p>
                  </div>
                  <p className="text-slate-100 text-sm font-bold">৳{(Number.parseFloat(item.total)||0).toLocaleString()}</p>
                </li>
              ))}
              <li className="px-4 py-3 flex items-center justify-between bg-indigo-500/10">
                <p className="text-indigo-300 text-sm font-bold">Total</p>
                <p className="text-indigo-400 text-base font-extrabold">৳{(Number.parseFloat(invoice.total)||0).toLocaleString()}</p>
              </li>
            </ul>
          )}
        </div>

        {invoice.notes && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Notes</p>
            <p className="text-slate-300 text-sm">{invoice.notes}</p>
          </div>
        )}

        {payments.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-slate-300">Payments</h3>
            </div>
            <ul>
              {payments.map((p, i) => (
                <li key={p.id || `payment-${i}`} className={`flex items-center justify-between px-4 py-3 ${i < payments.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <div>
                    <p className="text-slate-200 text-sm font-semibold capitalize">{p.method?.replace('_', ' ')}</p>
                    <p className="text-slate-500 text-xs">{new Date(p.created_at).toLocaleDateString()}{p.receipt_no ? ` · ${p.receipt_no}` : ''}</p>
                  </div>
                  <p className="text-emerald-400 font-bold text-sm">৳{(Number.parseFloat(p.amount)||0).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
          <div className="flex flex-col gap-3">
            <button onClick={openPaymentModal}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-emerald-500/20">
              <Plus size={18} /> Record Payment
            </button>
            <button onClick={() => setShowCancel(true)}
              className="w-full flex items-center justify-center gap-2 text-red-400 hover:bg-red-500/10 font-semibold py-3 rounded-2xl transition-colors">
              <XCircle size={16} /> Cancel Invoice
            </button>
          </div>
        )}

        {invoice.status === 'paid' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle size={24} className="text-emerald-400 flex-none" />
            <div>
              <p className="text-emerald-400 font-bold text-sm">Fully Paid</p>
              <p className="text-slate-500 text-xs mt-0.5">৳{(Number.parseFloat(invoice.total)||0).toLocaleString()} received</p>
            </div>
          </div>
        )}

        {invoice.status === 'cancelled' && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3">
            <XCircle size={24} className="text-red-400 flex-none" />
            <div>
              <p className="text-red-400 font-bold text-sm">Invoice Cancelled</p>
              <p className="text-slate-500 text-xs mt-0.5">{invoice.cancel_reason || 'No reason provided'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50">
          <div className="bg-[#0d1526] rounded-t-2xl w-full p-5 pb-24">
            <h2 className="text-lg font-bold text-slate-100 mb-1">Record Payment</h2>
            <p className="text-slate-500 text-xs mb-4">Remaining: ৳{remaining.toLocaleString()}</p>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="pay-amount" className="text-xs text-slate-500 font-semibold">Amount (৳) *</label>
                <input id="pay-amount" type="number" value={payForm.amount} onChange={e => setPayForm(p => ({...p, amount: e.target.value}))}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"/>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="pay-method" className="text-xs text-slate-500 font-semibold">Method</label>
                <select id="pay-method" value={payForm.method} onChange={e => setPayForm(p => ({...p, method: e.target.value}))}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="pay-notes" className="text-xs text-slate-500 font-semibold">Notes</label>
                <input id="pay-notes" value={payForm.notes} onChange={e => setPayForm(p => ({...p, notes: e.target.value}))} placeholder="Optional"
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"/>
              </div>
              <div className="flex gap-3 mt-1">
                <button onClick={() => setShowPayment(false)} className="flex-1 border border-slate-700 text-slate-300 rounded-xl py-2.5 text-sm font-semibold">Cancel</button>
                <button onClick={recordPayment} disabled={paying}
                  className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">
                  {paying ? 'Saving…' : 'Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50">
          <div className="bg-[#0d1526] rounded-t-2xl w-full p-5 max-h-[82vh] overflow-y-auto pb-24">
            <h2 className="text-lg font-bold text-slate-100 mb-4">Edit Invoice</h2>
            <div className="mb-3">
              <label htmlFor="edit-due-date" className="text-sm text-slate-400">Due Date</label>
              <input id="edit-due-date" type="date" value={editForm.due_date} onChange={e => setEditForm({...editForm, due_date: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg p-2 mt-1" />
            </div>
            <div className="mb-3">
              <label htmlFor="edit-notes" className="text-sm text-slate-400">Notes</label>
              <textarea id="edit-notes" value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} rows={2}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg p-2 mt-1 resize-none" />
            </div>
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Items</span>
                <button onClick={addEditItem}
                  className="text-xs text-indigo-400 font-bold">+ Add Item</button>
              </div>
              {editItems.map((item, idx) => (
                <div key={item.id || `edit-item-${idx}`} className="flex flex-col gap-1 mb-3 bg-slate-800 rounded-xl p-3">
                  <input value={item.description} onChange={e => updateEditItem(idx, 'description', e.target.value)}
                    placeholder="Description" className="bg-slate-700 border border-slate-600 text-slate-200 rounded-lg p-2 text-sm" />
                  <div className="flex gap-2">
                    <input value={item.quantity} onChange={e => updateEditItem(idx, 'quantity', e.target.value)}
                      placeholder="Qty" type="number" className="bg-slate-700 border border-slate-600 text-slate-200 rounded-lg p-2 text-sm w-1/3" />
                    <input value={item.unit_price} onChange={e => updateEditItem(idx, 'unit_price', e.target.value)}
                      placeholder="Price" type="number" className="bg-slate-700 border border-slate-600 text-slate-200 rounded-lg p-2 text-sm w-1/3" />
                    <button onClick={() => removeEditItem(idx)}
                      className="text-red-400 text-sm w-1/3">Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowEdit(false)} className="flex-1 border border-slate-700 text-slate-300 rounded-lg py-2">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="flex-1 bg-indigo-600 text-white rounded-lg py-2">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50">
          <div className="bg-[#0d1526] rounded-t-2xl w-full p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-2">Cancel Invoice</h2>
            <p className="text-slate-400 text-sm mb-4">This cannot be undone. Please provide a reason.</p>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Reason for cancellation..." rows={3}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg p-2 mb-4 resize-none" />
            <div className="flex gap-3">
              <button onClick={() => setShowCancel(false)} className="flex-1 border border-slate-700 text-slate-300 rounded-lg py-2">Back</button>
              <button onClick={cancelInvoice} disabled={saving} className="flex-1 bg-red-600 text-white rounded-lg py-2">{saving ? 'Cancelling...' : 'Confirm Cancel'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

InvoiceDetail.propTypes = {
  invoice: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    invoice_no: PropTypes.string,
    receipt_no: PropTypes.string,
    due_date: PropTypes.string,
    notes: PropTypes.string,
    total: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    status: PropTypes.string,
    issued_at: PropTypes.string,
    cancel_reason: PropTypes.string,
    candidates: PropTypes.shape({ full_name: PropTypes.string }),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdated: PropTypes.func.isRequired,
}
