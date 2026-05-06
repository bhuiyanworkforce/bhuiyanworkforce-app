import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { X } from 'lucide-react'

const VISA_TYPES = ['Work Permit','Visit Visa','Student Visa','Business Visa','Tourist Visa','Other']

export default function AddVisaModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ candidate_id:'', passport_id:'', visa_type:'Work Permit', country:'', deadline:'', notes:'' })
  const [candidates, setCandidates] = useState([])
  const [passports, setPassports] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  useEffect(() => {
    supabase.from('candidates').select('id,full_name').order('full_name').then(({data})=>setCandidates(data||[]))
  }, [])

  useEffect(() => {
    if (!form.candidate_id) { setPassports([]); return }
    supabase.from('passports').select('id,passport_no').eq('candidate_id',form.candidate_id)
      .then(({data})=>setPassports(data||[]))
  }, [form.candidate_id])

  async function handleSave() {
    if (!form.candidate_id || !form.country) { setError('Candidate and country required'); return }
    setSaving(true)
    const { error: err } = await supabase.from('visa_applications').insert({
      candidate_id: form.candidate_id,
      passport_id: form.passport_id||null,
      visa_type: form.visa_type,
      country: form.country,
      deadline: form.deadline||null,
      notes: form.notes||null,
      status: 'draft',
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[82vh] overflow-y-auto mb-16">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">New Visa Application</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <div className="p-5 pb-10 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Candidate *</span>
            <select value={form.candidate_id} onChange={e=>set('candidate_id',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="">— Select Candidate —</option>
              {candidates.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </label>
          {passports.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Passport</span>
              <select value={form.passport_id} onChange={e=>set('passport_id',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
                <option value="">— Select Passport —</option>
                {passports.map(p=><option key={p.id} value={p.id}>{p.passport_no}</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Visa Type</span>
              <select value={form.visa_type} onChange={e=>set('visa_type',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
                {VISA_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Country *</span>
              <input value={form.country} onChange={e=>set('country',e.target.value)} placeholder="e.g. Saudi Arabia" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Deadline</span>
            <input type="date" value={form.deadline} onChange={e=>set('deadline',e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Notes</span>
            <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={2} placeholder="Optional" className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"/>
          </label>
          <button onClick={handleSave} disabled={saving} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white py-3 rounded-xl font-bold text-sm mt-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Create Application'}
          </button>
        </div>
      </div>
    </div>
  )
}

AddVisaModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}
