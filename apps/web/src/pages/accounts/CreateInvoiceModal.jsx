import PropTypes from 'prop-types'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { X, Plus, Trash2 } from 'lucide-react'

export default function CreateInvoiceModal({ onClose, onSaved }) {
  const [candidates, setCandidates] = useState([])
  const [agents, setAgents] = useState([])
  const [form, setForm] = useState({
    candidate_id: '', agent_id: '', due_date: '', notes: '',
  })
  const [items, setItems] = useState([
    { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: '' }
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('candidates').select('id, full_name, agent_id').order('full_name'),
      supabase.from('agents').select('id, full_name').order('full_name'),
    ]).then(([{ data: cands }, { data: ags }]) => {
      setCandidates(cands || [])
      setAgents(ags || [])
    })
  }, [])

  // Auto-assign agent when candidate is selected
  function handleCandidateChange(candidateId) {
    const candidate = candidates.find(c => c.id === candidateId)
    setForm(f => ({
      ...f,
      candidate_id: candidateId,
      agent_id: candidate?.agent_id || f.agent_id
    }))
  }

  function addItem() {
    setItems(prev => [...prev, { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: '' }])
  }

  function removeItem(id) {
    setItems(prev => prev.filter(item => item.id !== id))
  }

  function updateItem(id, field, value) {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  // Fix: use Number.parseFloat instead of parseFloat (SonarCloud es2015 convention)
  const subtotal = items.reduce((sum, item) =>
    sum + (Number.parseFloat(item.quantity) || 0) * (Number.parseFloat(item.unit_price) || 0), 0)

  async function handleSave() {
    if (!form.candidate_id) { setError('Please select a candidate'); return }
    if (items.some(i => !i.description || !i.unit_price)) {
      setError('Please fill all item fields'); return
    }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    // Use a UUID fragment instead of Date.now() so that two invoices
    // created in the same millisecond (e.g. two browser tabs) never
    // generate the same invoice_no.
    const invoiceNo = 'INV-' + crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        invoice_no: invoiceNo,
        candidate_id: form.candidate_id,
        agent_id: form.agent_id || null,
        subtotal,
        total: subtotal,
        due_date: form.due_date || null,
        notes: form.notes || null,
        status: 'unpaid',
        created_by: user.id,
      })
      .select()
      .single()

    if (invErr) { setError(invErr.message); setSaving(false); return }

    await supabase.from('invoice_items').insert(
      items.map(item => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: Number.parseFloat(item.quantity),
        unit_price: Number.parseFloat(item.unit_price),
        total: Number.parseFloat(item.quantity) * Number.parseFloat(item.unit_price),
      }))
    )
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <h2 className="text-base font-bold text-slate-100">New Invoice</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={20} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl px-4 py-3">{error}</div>
          )}

          {/* Candidate */}
          <div>
            {/* Fix: associate label with control via htmlFor/id */}
            <label htmlFor="candidate-select" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Candidate</label>
            <select
              id="candidate-select"
              value={form.candidate_id}
              onChange={e => handleCandidateChange(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select candidate...</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>

          {/* Agent */}
          <div>
            <label htmlFor="agent-select" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Agent <span className="text-slate-600 font-normal">(auto-filled if candidate has agent)</span>
            </label>
            <select
              id="agent-select"
              value={form.agent_id}
              onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="">No agent</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label htmlFor="due-date-input" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Due Date</label>
            <input
              id="due-date-input"
              type="date"
              value={form.due_date}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Items</span>
              <button onClick={addItem} className="flex items-center gap-1 text-indigo-400 text-xs font-semibold">
                <Plus size={14} /> Add Item
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {/* Fix: use stable unique id as key instead of array index */}
              {items.map((item, i) => (
                <div key={item.id} className="bg-slate-800 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-semibold">Item {i + 1}</span>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(item.id)} className="text-red-400"><Trash2 size={14} /></button>
                    )}
                  </div>
                  {/* Fix: associate labels with inputs via htmlFor/id */}
                  <label htmlFor={`item-desc-${item.id}`} className="sr-only">Description</label>
                  <input
                    id={`item-desc-${item.id}`}
                    placeholder="e.g. Visa Processing Fee"
                    value={item.description}
                    onChange={e => updateItem(item.id, 'description', e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={`item-qty-${item.id}`} className="text-[10px] text-slate-500 mb-1 block">Qty</label>
                      <input
                        id={`item-qty-${item.id}`}
                        type="number" min="1"
                        value={item.quantity}
                        onChange={e => updateItem(item.id, 'quantity', e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor={`item-price-${item.id}`} className="text-[10px] text-slate-500 mb-1 block">Price (৳)</label>
                      <input
                        id={`item-price-${item.id}`}
                        type="number" min="0" placeholder="0"
                        value={item.unit_price}
                        onChange={e => updateItem(item.id, 'unit_price', e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  {item.description && item.unit_price && (
                    <p className="text-right text-indigo-400 text-xs font-bold">
                      ৳{((Number.parseFloat(item.quantity)||0)*(Number.parseFloat(item.unit_price)||0)).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes-textarea" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Notes</label>
            <textarea
              id="notes-textarea"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes..."
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Total */}
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-slate-300 text-sm font-semibold">Total</span>
            <span className="text-indigo-400 text-xl font-extrabold">৳{subtotal.toLocaleString()}</span>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Fix: add PropTypes validation for onClose and onSaved
CreateInvoiceModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}
