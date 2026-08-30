import PropTypes from 'prop-types'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/Modal'

export default function AddCandidateModal({ open, onClose, onSaved }) {
  const [agents, setAgents] = useState([])
  const [form, setForm] = useState({
    full_name: '', phone: '', nationality: 'Bangladeshi',
    address: '', date_of_birth: '', agent_id: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState(null)

  useEffect(() => {
    supabase.from('agents').select('id, full_name').order('full_name')
      .then(({ data }) => setAgents(data || []))
  }, [])

  function reset() {
    setForm({ full_name: '', phone: '', nationality: 'Bangladeshi', address: '', date_of_birth: '', agent_id: '' })
    setError('')
    setDuplicate(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function insertCandidate(user) {
    const { error } = await supabase.from('candidates').insert({
      full_name: form.full_name, phone: form.phone,
      nationality: form.nationality, address: form.address,
      date_of_birth: form.date_of_birth || null,
      agent_id: form.agent_id || null, created_by: user.id,
    })
    if (error) { setError(error.message); setSaving(false) }
    else { reset(); onSaved() }
  }

  // Fix / feature: nothing previously checked whether this phone number
  // already belonged to a candidate before creating a new record — exactly
  // how a duplicate/test entry (the "Al amin" case) can end up sitting
  // alongside a real one. This checks by phone number (the one field most
  // likely to genuinely identify the same person) and asks before creating
  // a second record. If the match is an archived candidate, offer to
  // restore them instead of creating a duplicate — the more likely real
  // intent when someone "comes back."
  async function handleSave() {
    if (!form.full_name) { setError('Name is required'); return }
    setSaving(true)
    setError('')

    if (form.phone.trim() && !duplicate) {
      const { data: matches } = await supabase
        .from('candidates')
        .select('id, full_name, archived_at')
        .eq('phone', form.phone.trim())
        .limit(1)
      if (matches && matches.length > 0) {
        setDuplicate(matches[0])
        setSaving(false)
        return
      }
    }

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) {
      setError('Your session has expired. Please log in again.')
      setSaving(false)
      return
    }
    await insertCandidate(user)
  }

  async function handleRestoreDuplicate() {
    setSaving(true)
    const { error } = await supabase.from('candidates').update({ archived_at: null }).eq('id', duplicate.id)
    if (error) { setError(error.message); setSaving(false); return }
    reset()
    onSaved()
  }

  async function handleSaveAnyway() {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) {
      setError('Your session has expired. Please log in again.')
      setSaving(false)
      return
    }
    await insertCandidate(user)
  }

  const field = (label, key, type = 'text', placeholder = '') => {
    const id = `candidate-field-${key}`
    return (
      <div>
        <label htmlFor={id} className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">{label}</label>
        <input id={id} type={type} value={form[key]} placeholder={placeholder}
          onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setDuplicate(null) }}
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
      </div>
    )
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Candidate">
      <div className="p-5 flex flex-col gap-4">
        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl px-4 py-3">{error}</div>}
        {duplicate && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs rounded-xl px-4 py-3 flex flex-col gap-2">
            <span>
              {duplicate.archived_at
                ? `This phone number belongs to an archived candidate: ${duplicate.full_name}. Restore them instead of creating a new record?`
                : `A candidate with this phone number already exists: ${duplicate.full_name}.`}
            </span>
            <div className="flex gap-2 flex-wrap">
              {duplicate.archived_at && (
                <button onClick={handleRestoreDuplicate} disabled={saving}
                  className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg disabled:opacity-50">
                  Restore {duplicate.full_name}
                </button>
              )}
              <button onClick={handleSaveAnyway} disabled={saving}
                className="text-xs font-bold bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg disabled:opacity-50">
                {saving ? 'Saving...' : 'Save as New Anyway'}
              </button>
              <button onClick={() => setDuplicate(null)} className="text-xs text-slate-500 px-3 py-1.5">
                Cancel
              </button>
            </div>
          </div>
        )}
        {field('Full Name', 'full_name', 'text', 'Candidate full name')}
        {field('Phone', 'phone', 'tel', '01XXXXXXXXX')}
        {field('Nationality', 'nationality')}
        {field('Address', 'address')}
        {field('Date of Birth', 'date_of_birth', 'date')}
        <div>
          <label htmlFor="candidate-field-agent_id" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
            Assign to Agent <span className="text-slate-600 font-normal">(optional)</span>
          </label>
          <select id="candidate-field-agent_id" value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="">No agent assigned</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </div>
        {!duplicate && (
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3 rounded-xl disabled:opacity-50">
            {saving ? 'Checking...' : 'Save Candidate'}
          </button>
        )}
      </div>
    </Modal>
  )
}

AddCandidateModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}
