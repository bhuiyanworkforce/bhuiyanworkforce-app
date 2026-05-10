import PropTypes from 'prop-types'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { X } from 'lucide-react'

export default function AddAgentModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '',
    commission_rate: '5', company: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.full_name) { setError('Name is required'); return }
    setSaving(true)
    setError('')

    const { error: err } = await supabase.from('agents').insert({
      full_name: form.full_name,
      phone: form.phone,
      email: form.email,
      company: form.company,
      commission_rate: Number.parseFloat(form.commission_rate) || 0,
      commission_type: 'percentage',
    })

    if (err) { setError(err.message); setSaving(false) }
    else onSaved()
  }

  const field = (label, key, type = 'text', placeholder = '') => {
    const id = `agent-field-${key}`
    return (
      <div>
        <label htmlFor={id} className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">{label}</label>
        <input
          id={id}
          type={type}
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h2 className="text-base font-bold text-slate-100">Add Agent</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={20} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl px-4 py-3">{error}</div>
          )}
          {field('Full Name', 'full_name', 'text', 'Agent full name')}
          {field('Phone', 'phone', 'tel', '01XXXXXXXXX')}
          {field('Email', 'email', 'email', 'agent@example.com')}
          {field('Company', 'company', 'text', 'Company name')}
          <div>
            <label htmlFor="agent-field-commission_rate" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Commission Rate (%)</label>
            <input
              id="agent-field-commission_rate"
              type="number" min="0" max="100"
              value={form.commission_rate}
              onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-gradient-to-r from-pink-500 to-rose-600 text-white font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add Agent'}
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
