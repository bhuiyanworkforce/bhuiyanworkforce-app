import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { X } from 'lucide-react'

const STATUSES = [
  'received','interview','medical','police_clearance','bmet',
  'calling_list','visa_stamping','mofa','traveling','returned','cancelled'
]

export default function EditPassportModal({ passport, onClose, onSaved }) {
  const [form, setForm] = useState({
    passport_no:      passport.passport_no      || '',
    issue_date:       passport.issue_date       || '',
    expiry_date:      passport.expiry_date      || '',
    place_of_issue:   passport.place_of_issue   || '',
    current_location: passport.current_location || '',
    status:           passport.status           || 'received',
    notes:            passport.notes            || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function handleSave() {
    if (!form.passport_no.trim()) { setError('Passport number is required'); return }
    setSaving(true)
    const { error: err } = await supabase
      .from('passports')
      .update({
        passport_no:      form.passport_no.trim(),
        issue_date:       form.issue_date       || null,
        expiry_date:      form.expiry_date      || null,
        place_of_issue:   form.place_of_issue   || null,
        current_location: form.current_location || null,
        status:           form.status,
        notes:            form.notes            || null,
      })
      .eq('id', passport.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved({ ...passport, ...form })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">Edit Passport</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <div className="p-5 pb-24 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Passport No. *</span>
            <input value={form.passport_no} onChange={e => set('passport_no', e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500"/>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Issue Date</span>
              <input type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Expiry Date</span>
              <input type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Place of Issue</span>
            <input value={form.place_of_issue} onChange={e => set('place_of_issue', e.target.value)}
              placeholder="e.g. Dhaka"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Current Location</span>
            <input value={form.current_location} onChange={e => set('current_location', e.target.value)}
              placeholder="e.g. Office, Embassy, Candidate"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Status</span>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              {/* FIX L90: replaceAll instead of replace */}
              {STATUSES.map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Notes</span>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="Optional"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"/>
          </label>

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white py-3 rounded-xl font-bold text-sm mt-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// FIX L10 (×11): PropTypes for passport (all nested fields + id), onClose, onSaved
EditPassportModal.propTypes = {
  passport: PropTypes.shape({
    id:               PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    passport_no:      PropTypes.string,
    issue_date:       PropTypes.string,
    expiry_date:      PropTypes.string,
    place_of_issue:   PropTypes.string,
    current_location: PropTypes.string,
    status:           PropTypes.string,
    notes:            PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}
