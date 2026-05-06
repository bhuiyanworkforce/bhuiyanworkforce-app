import PropTypes from 'prop-types'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { X, CheckCircle, Circle, Clock, AlertCircle, Edit2, Save } from 'lucide-react'

const WORKFLOW = [
  { key: 'draft',      label: 'Draft',      desc: 'Application created, not yet submitted' },
  { key: 'submitted',  label: 'Submitted',  desc: 'Application submitted to authority' },
  { key: 'in_review',  label: 'In Review',  desc: 'Under review by visa authority' },
  { key: 'at_embassy', label: 'At Embassy', desc: 'Sent to embassy for processing' },
  { key: 'approved',   label: 'Approved',   desc: 'Visa approved successfully' },
  { key: 'rejected',   label: 'Rejected',   desc: 'Application rejected' },
]

const STATUS_COLOR = {
  draft:      'bg-slate-500/15 text-slate-400',
  submitted:  'bg-indigo-500/15 text-indigo-400',
  in_review:  'bg-amber-500/15 text-amber-400',
  at_embassy: 'bg-violet-500/15 text-violet-400',
  approved:   'bg-emerald-500/15 text-emerald-400',
  rejected:   'bg-red-500/15 text-red-400',
}

const STATUS_INDEX = Object.fromEntries(WORKFLOW.map((s, i) => [s.key, i]))

// Extracted helpers to fix nested ternary warnings (L145, L147, L148, L151 x2)
function getStepIcon(done, active, stepKey) {
  if (done) return <CheckCircle size={18} className="text-emerald-400 flex-none" />
  if (active) return <Clock size={18} className="text-amber-400 flex-none" />
  if (stepKey === 'rejected') return <AlertCircle size={18} className="text-red-400 flex-none" />
  return <Circle size={18} className="text-slate-600 flex-none" />
}

function getStepLabelClass(active, done, future) {
  if (active) return 'text-sm font-semibold text-amber-300'
  if (done) return 'text-sm font-semibold text-emerald-400'
  if (future) return 'text-sm font-semibold text-slate-500'
  return 'text-sm font-semibold text-slate-300'
}

function getStepBgClass(active, done) {
  if (active) return 'flex items-center gap-3 p-3 rounded-xl transition-colors text-left bg-amber-500/10 border border-amber-500/30'
  if (done) return 'flex items-center gap-3 p-3 rounded-xl transition-colors text-left bg-emerald-500/5'
  return 'flex items-center gap-3 p-3 rounded-xl transition-colors text-left bg-slate-800/50'
}

export default function VisaDetail({ visa: initialVisa, onClose, onUpdated }) {
  const [visa, setVisa] = useState(initialVisa)
  const [advancing, setAdvancing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    visa_type: initialVisa.visa_type || '',
    country:   initialVisa.country   || '',
    deadline:  initialVisa.deadline  || '',
    notes:     initialVisa.notes     || '',
  })
  const [saving, setSaving] = useState(false)

  const currentIndex = STATUS_INDEX[visa.status] ?? 0
  const isTerminal = visa.status === 'approved' || visa.status === 'rejected'

  async function advanceStatus() {
    if (isTerminal) return
    const nextStatus = WORKFLOW[currentIndex + 1]?.key
    if (!nextStatus) return
    setAdvancing(true)
    await supabase.from('visa_applications').update({ status: nextStatus }).eq('id', visa.id)
    setVisa(v => ({ ...v, status: nextStatus }))
    onUpdated(nextStatus)
    setAdvancing(false)
  }

  async function setStatus(status) {
    setAdvancing(true)
    await supabase.from('visa_applications').update({ status }).eq('id', visa.id)
    setVisa(v => ({ ...v, status }))
    onUpdated(status)
    setAdvancing(false)
  }

  async function saveEdit() {
    setSaving(true)
    const { error } = await supabase.from('visa_applications').update(editForm).eq('id', visa.id)
    if (!error) {
      setVisa(v => ({ ...v, ...editForm }))
      setEditing(false)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800 bg-[#080F1E]">
        <div className="flex items-center gap-3">
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
          <div>
            <h2 className="text-slate-100 font-bold text-base">{visa.candidates?.full_name || 'Visa Application'}</h2>
            <span className={"text-[10px] font-bold uppercase px-2 py-0.5 rounded-full " + (STATUS_COLOR[visa.status] || 'bg-slate-700 text-slate-300')}>
              {visa.status?.replace('_', ' ')}
            </span>
          </div>
        </div>
        <button onClick={() => setEditing(e => !e)}
          className={"flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold " + (editing ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-800 text-slate-400')}>
          {editing ? <Save size={13}/> : <Edit2 size={13}/>}
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        {/* Edit Form */}
        {editing && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Edit Details</p>
            {[['Visa Type', 'visa_type', 'text'], ['Country', 'country', 'text']].map(([label, key, type]) => (
              <div key={key}>
                {/* L102 & L107: label associated with a control via htmlFor */}
                <label htmlFor={`edit-${key}`} className="text-xs text-slate-500 block mb-1">{label}</label>
                <input id={`edit-${key}`} type={type} value={editForm[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"/>
              </div>
            ))}
            <div>
              <label htmlFor="edit-deadline" className="text-xs text-slate-500 block mb-1">Deadline</label>
              <input id="edit-deadline" type="date" value={editForm.deadline} onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"/>
            </div>
            <div>
              <label htmlFor="edit-notes" className="text-xs text-slate-500 block mb-1">Notes</label>
              <textarea id="edit-notes" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 resize-none"/>
            </div>
            <button onClick={saveEdit} disabled={saving}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

        {/* Info */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Details</p>
          {[
            ['Visa Type', visa.visa_type],
            ['Country', visa.country],
            ['Passport', visa.passports?.passport_no],
            ['Deadline', visa.deadline ? new Date(visa.deadline).toLocaleDateString() : null],
            ['Notes', visa.notes],
          ].map(([label, value]) => value ? (
            <div key={label} className="flex justify-between">
              <span className="text-slate-500 text-sm">{label}</span>
              <span className="text-slate-200 text-sm font-medium">{value}</span>
            </div>
          ) : null)}
        </div>

        {/* Workflow */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Workflow</p>
          <div className="flex flex-col gap-2">
            {WORKFLOW.map((step, i) => {
              const done = i < currentIndex
              const active = i === currentIndex
              const future = i > currentIndex
              return (
                <button key={step.key} onClick={() => !active && setStatus(step.key)} disabled={advancing}
                  className={getStepBgClass(active, done)}>
                  {getStepIcon(done, active, step.key)}
                  <div className="flex-1">
                    <p className={getStepLabelClass(active, done, future)}>
                      {step.label}
                    </p>
                    <p className="text-xs text-slate-600">{step.desc}</p>
                  </div>
                  {active && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">CURRENT</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Advance button */}
        {!isTerminal && currentIndex < WORKFLOW.length - 2 && (
          <button onClick={advanceStatus} disabled={advancing}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold py-3 rounded-xl disabled:opacity-50">
            {advancing ? 'Updating...' : 'Advance to ' + WORKFLOW[currentIndex + 1]?.label}
          </button>
        )}

        {!isTerminal && (
          <button onClick={() => setStatus('rejected')} disabled={advancing}
            className="w-full bg-red-500/10 border border-red-500/20 text-red-400 font-bold py-3 rounded-xl disabled:opacity-50">
            Mark as Rejected
          </button>
        )}
      </div>
    </div>
  )
}

// Fix: PropTypes validation for visa, onClose, onUpdated (L25 issues)
VisaDetail.propTypes = {
  visa: PropTypes.shape({
    id:         PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    status:     PropTypes.string,
    visa_type:  PropTypes.string,   // L30
    country:    PropTypes.string,   // L31
    deadline:   PropTypes.string,   // L32
    notes:      PropTypes.string,   // L33
    candidates: PropTypes.shape({ full_name: PropTypes.string }),
    passports:  PropTypes.shape({ passport_no: PropTypes.string }),
  }).isRequired,
  onClose:   PropTypes.func.isRequired,   // L25
  onUpdated: PropTypes.func.isRequired,   // L25
}
