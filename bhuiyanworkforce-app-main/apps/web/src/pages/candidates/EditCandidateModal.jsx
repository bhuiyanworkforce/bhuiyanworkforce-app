import PropTypes from 'prop-types'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { X } from 'lucide-react'

export default function EditCandidateModal({ candidate, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name:     candidate.full_name     || '',
    phone:         candidate.phone         || '',
    nationality:   candidate.nationality   || 'Bangladeshi',
    address:       candidate.address       || '',
    date_of_birth: candidate.date_of_birth || '',
    agent_id:      candidate.agent_id      || '',
  })
  const [agents, setAgents]   = useState([])
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    supabase.from('agents').select('id, full_name').order('full_name')
      .then(({ data }) => setAgents(data || []))
  }, [])

  async function handleSave() {
    if (!form.full_name.trim()) { setError('Name is required'); return }
    setSaving(true)
    const { error: err } = await supabase
      .from('candidates')
      .update({ ...form, name: form.full_name, agent_id: form.agent_id || null })
      .eq('id', candidate.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved({ ...candidate, ...form })
  }

  // The mapped fields — each gets an explicit id so <label htmlFor> can reference it
  const TEXT_FIELDS = [
    { label: 'Full Name',    key: 'full_name',   type: 'text', placeholder: 'Enter full name' },
    { label: 'Phone',        key: 'phone',        type: 'tel',  placeholder: 'Phone number'    },
    { label: 'Nationality',  key: 'nationality',  type: 'text', placeholder: 'e.g. Bangladeshi'},
    { label: 'Address',      key: 'address',      type: 'text', placeholder: 'Home address'    },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h2 className="text-base font-bold text-slate-100">Edit Candidate</h2>
          <button onClick={onClose}><X size={20} className="text-slate-500" /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* FIX L44–L56 & L58 & L63: each label now has htmlFor matching the input's id */}
          {TEXT_FIELDS.map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label
                htmlFor={`edit-candidate-${key}`}
                className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5"
              >
                {label}
              </label>
              <input
                id={`edit-candidate-${key}`}
                type={type}
                placeholder={placeholder}
                value={form[key]}
                onChange={e => set(key, e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          ))}

          {/* FIX L58: label associated via htmlFor + id */}
          <div>
            <label
              htmlFor="edit-candidate-date_of_birth"
              className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5"
            >
              Date of Birth
            </label>
            <input
              id="edit-candidate-date_of_birth"
              type="date"
              value={form.date_of_birth}
              onChange={e => set('date_of_birth', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* FIX L63: label associated via htmlFor + id */}
          <div>
            <label
              htmlFor="edit-candidate-agent_id"
              className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5"
            >
              Agent
            </label>
            <select
              id="edit-candidate-agent_id"
              value={form.agent_id}
              onChange={e => set('agent_id', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="">No agent</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 mt-1"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// FIX L5 (×10) & L30: PropTypes for all props and nested candidate fields
EditCandidateModal.propTypes = {
  candidate: PropTypes.shape({
    id:            PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    full_name:     PropTypes.string,
    phone:         PropTypes.string,
    nationality:   PropTypes.string,
    address:       PropTypes.string,
    date_of_birth: PropTypes.string,
    agent_id:      PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}
