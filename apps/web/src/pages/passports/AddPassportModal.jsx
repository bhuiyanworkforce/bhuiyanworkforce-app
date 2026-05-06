import PropTypes from 'prop-types'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Scan } from 'lucide-react'
import Modal from '../../components/Modal'
import OCRScanner from './OCRScanner'

export default function AddPassportModal({ open, onClose, onSaved }) {
  const [candidates, setCandidates] = useState([])
  const [form, setForm] = useState({
    candidate_id: '', passport_no: '', issue_date: '',
    expiry_date: '', place_of_issue: '', current_location: 'Office',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (open) {
      supabase.from('candidates').select('id, full_name').order('full_name')
        .then(({ data }) => setCandidates(data || []))
    }
  }, [open])

  function handleOCRResult(result) {
    setShowScanner(false)
    if (result.passport_no) set('passport_no', result.passport_no)
    if (result.expiry_date) set('expiry_date', result.expiry_date)
    setError('')
  }

  async function handleSave() {
    if (!form.candidate_id || !form.passport_no) {
      setError('Candidate and passport number are required')
      return
    }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('passports').insert({
      candidate_id: form.candidate_id,
      passport_no: form.passport_no.trim().toUpperCase(),
      issue_date: form.issue_date || null,
      expiry_date: form.expiry_date || null,
      place_of_issue: form.place_of_issue || null,
      current_location: form.current_location,
      status: 'received',
      created_by: user.id,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setForm({ candidate_id: '', passport_no: '', issue_date: '', expiry_date: '', place_of_issue: '', current_location: 'Office' })
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Passport">
      <div className="flex flex-col gap-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl px-4 py-3">{error}</div>
        )}

        {/* OCR Scan Button */}
        <button onClick={() => setShowScanner(true)}
          className="flex items-center justify-center gap-2 w-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 font-bold py-3 rounded-xl text-sm">
          <Scan size={16}/> Scan Passport (Auto-fill)
        </button>

        {/* L71 – form label must be associated with a control */}
        <div>
          <label htmlFor="candidate_id" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Candidate *</label>
          <select id="candidate_id" value={form.candidate_id} onChange={e => set('candidate_id', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="">Select candidate...</option>
            {candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </div>

        {/* L80 – form label must be associated with a control */}
        <div>
          <label htmlFor="passport_no" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Passport Number *</label>
          <input id="passport_no" value={form.passport_no} onChange={e => set('passport_no', e.target.value.toUpperCase())}
            placeholder="e.g. AB1234567"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono tracking-widest"/>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* L88 – form label must be associated with a control */}
          <div>
            <label htmlFor="issue_date" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Issue Date</label>
            <input id="issue_date" type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </div>
          {/* L93 – form label must be associated with a control */}
          <div>
            <label htmlFor="expiry_date" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Expiry Date</label>
            <input id="expiry_date" type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </div>
        </div>

        {/* L100 – form label must be associated with a control */}
        <div>
          <label htmlFor="place_of_issue" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Place of Issue</label>
          <input id="place_of_issue" value={form.place_of_issue} onChange={e => set('place_of_issue', e.target.value)}
            placeholder="e.g. Dhaka"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"/>
        </div>

        {/* L107 – form label must be associated with a control */}
        <div>
          <label htmlFor="current_location" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Current Location</label>
          <select id="current_location" value={form.current_location} onChange={e => set('current_location', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
            {['Office', 'Embassy', 'Agent', 'Candidate', 'Other'].map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 mt-1">
          {saving ? 'Saving...' : 'Save Passport'}
        </button>
      </div>

      {showScanner && (
        <OCRScanner
          onResult={handleOCRResult}
          onClose={() => setShowScanner(false)}
        />
      )}
    </Modal>
  )
}

// L7 – 'open', 'onClose', 'onSaved' missing in props validation
AddPassportModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}
