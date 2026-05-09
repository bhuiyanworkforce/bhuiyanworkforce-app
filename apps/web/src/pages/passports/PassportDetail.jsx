import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import EditPassportModal from './EditPassportModal'
import { X, ChevronRight, CheckCircle, Circle, Clock, AlertCircle, Pencil } from 'lucide-react'

const WORKFLOW = [
  { key: 'received',        label: 'Received',         desc: 'Passport received at office' },
  { key: 'interview',       label: 'Interview',         desc: 'Candidate interview scheduled' },
  { key: 'medical',         label: 'Medical',           desc: 'Medical checkup completed' },
  { key: 'police_clearance',label: 'Police Clearance',  desc: 'Police clearance certificate' },
  { key: 'bmet',            label: 'BMET',              desc: 'BMET registration done' },
  { key: 'calling_list',    label: 'Calling List',      desc: 'Added to calling list' },
  { key: 'visa_stamping',   label: 'Visa Stamping',     desc: 'Visa stamping in progress' },
  { key: 'mofa',            label: 'MOFA',              desc: 'MOFA attestation done' },
  { key: 'traveling',       label: 'Traveling',         desc: 'Candidate traveling' },
  { key: 'returned',        label: 'Returned',          desc: 'Passport returned to candidate' },
]

const STATUS_INDEX = Object.fromEntries(WORKFLOW.map((s, i) => [s.key, i]))
const API_URL = import.meta.env.VITE_API_URL

// Moved to outer scope (SonarCloud: move getStageLabelClass to outer scope)
function getStageLabelClass(isDone, isCurrent) {
  if (isDone) return 'text-emerald-400'
  if (isCurrent) return 'text-indigo-300'
  return 'text-slate-500'
}

function getStageIcon(isDone, isCurrent, isFuture) {
  if (isDone) return <CheckCircle size={18} className="text-emerald-400" />
  if (isCurrent) return <Clock size={18} className="text-indigo-400 animate-pulse" />
  if (isFuture) return <Circle size={18} className="text-slate-600" />
  return <AlertCircle size={18} className="text-red-400" />
}

export default function PassportDetail({ passport: initialPassport, onClose, onUpdated }) {
  const [passport, setPassport] = useState(initialPassport)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const currentIndex = STATUS_INDEX[passport.status] ?? 0
  const isCompleted = passport.status === 'returned'
  const isCancelled = passport.status === 'cancelled'

  useEffect(() => { fetchLogs() }, [])

  async function fetchLogs() {
    try {
      const { data, error } = await supabase
        .from('passport_workflow_logs')
        .select('*, profiles(full_name)')
        .eq('passport_id', passport.id)
        .order('changed_at', { ascending: false })
      if (error) throw error
      setLogs(data || [])
    } catch (err) {
      console.error('[PassportDetail] fetchLogs failed:', err)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  function handleEdited() {
    setShowEdit(false)
    supabase.from('passports')
      .select('*, candidates(full_name, phone)')
      .eq('id', passport.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setPassport(data)
          onUpdated?.(data.status, data)
        }
      })
  }

  async function advanceStatus() {
    if (isCompleted || isCancelled) return
    const nextStage = WORKFLOW[currentIndex + 1]
    if (!nextStage) return
    setAdvancing(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    // SECURITY FIX (Roadmap §3.1): The previous implementation had a catch block
    // that directly wrote to Supabase if the API call failed. This bypassed
    // server-side rate limiting and email notifications, creating a potential
    // abuse vector. Now the API is the single source of truth for status updates.
    // On failure, we surface the error to the user instead of silently bypassing
    // security controls.
    try {
      const res = await fetch(`${API_URL}/api/v1/passports/status-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ passport_id: passport.id, new_status: nextStage.key, note: note || null, user_id: user.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Server error ${res.status}`)
      }
      setEmailSent(true)
      setTimeout(() => setEmailSent(false), 3000)
      setNote(''); setShowNote(false)
      setPassport(prev => ({ ...prev, status: nextStage.key }))
      onUpdated(nextStage.key)
      fetchLogs()
    } catch (err) {
      console.error('[PassportDetail] advanceStatus failed:', err)
      alert(`Failed to advance status: ${err.message}\n\nPlease check your connection and try again.`)
    } finally {
      setAdvancing(false)
    }
  }

  async function cancelPassport() {
    setCancelling(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    await supabase.from('passport_workflow_logs').insert({
      passport_id: passport.id, from_status: passport.status,
      to_status: 'cancelled', note: note || 'Cancelled', changed_by: user.id,
    })
    await supabase.from('passports').update({ status: 'cancelled' }).eq('id', passport.id)
    setCancelling(false)
    setPassport(prev => ({ ...prev, status: 'cancelled' }))
    onUpdated('cancelled')
    fetchLogs()
  }

  const nextStage = WORKFLOW[currentIndex + 1]

  // Extracted nested ternary (SonarCloud L224)
  function getAdvanceLabel() {
    if (advancing) return 'Updating...'
    return (
      <>Advance to {nextStage.label} <ChevronRight size={16} /></>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22} /></button>
          <div className="flex-1 min-w-0">
            <p className="text-slate-100 font-bold text-sm truncate">{passport.candidates?.full_name}</p>
            <p className="text-slate-500 text-xs font-mono">{passport.passport_no}</p>
          </div>
          {emailSent && <span className="text-xs font-bold text-emerald-400 bg-emerald-500/15 px-2 py-1 rounded-full animate-pulse">✉ Email sent!</span>}
          {isCancelled && <span className="text-xs font-bold text-red-400 bg-red-500/15 px-2 py-1 rounded-full">Cancelled</span>}
          <button onClick={() => setShowEdit(true)} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-semibold">
            <Pencil size={13} /> Edit
          </button>
        </div>

        <div className="p-4 flex flex-col gap-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
            {[
              { label: 'Issue Date',     value: passport.issue_date    ? new Date(passport.issue_date).toLocaleDateString()    : '—' },
              { label: 'Expiry Date',    value: passport.expiry_date   ? new Date(passport.expiry_date).toLocaleDateString()   : '—' },
              { label: 'Place of Issue', value: passport.place_of_issue || '—' },
              { label: 'Location',       value: passport.current_location || 'Office' },
            ].map(f => (
              <div key={f.label}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{f.label}</p>
                <p className="text-slate-200 text-sm font-semibold">{f.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-slate-300">Workflow Progress</h3>
              <p className="text-xs text-slate-500 mt-0.5">{currentIndex + 1} of {WORKFLOW.length} stages</p>
            </div>
            <div className="h-1.5 bg-slate-800">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500" style={{ width: `${((currentIndex + 1) / WORKFLOW.length) * 100}%` }} />
            </div>
            <div className="p-4 flex flex-col gap-3">
              {WORKFLOW.map((stage, i) => {
                const isDone    = i < currentIndex
                const isCurrent = i === currentIndex && !isCancelled
                const isFuture  = i > currentIndex
                return (
                  <div key={stage.key} className={`flex items-start gap-3 ${isFuture ? 'opacity-30' : ''}`}>
                    <div className="mt-0.5 flex-none">
                      {getStageIcon(isDone, isCurrent, isFuture)}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${getStageLabelClass(isDone, isCurrent)}`}>{stage.label}</p>
                      <p className="text-xs text-slate-600">{stage.desc}</p>
                    </div>
                    {isCurrent && !isCancelled && <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded-full">Current</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {!isCompleted && !isCancelled && nextStage && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-300">Next Action</h3>
                <span className="text-xs text-slate-500">📧 Agent notified by email</span>
              </div>
              {showNote && (
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note (optional)..." rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none" />
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowNote(!showNote)} className="flex-none px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl text-sm font-semibold transition-colors">
                  {showNote ? 'Hide' : '+ Note'}
                </button>
                <button onClick={advanceStatus} disabled={advancing}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold py-3 rounded-xl disabled:opacity-50">
                  {getAdvanceLabel()}
                </button>
              </div>
              <button onClick={cancelPassport} disabled={cancelling}
                className="w-full py-2.5 text-red-400 hover:bg-red-500/10 rounded-xl text-sm font-semibold transition-colors">
                {cancelling ? 'Cancelling...' : 'Cancel Passport'}
              </button>
            </div>
          )}

          {isCompleted && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-center">
              <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2" />
              <p className="text-emerald-400 font-bold">Workflow Complete</p>
              <p className="text-slate-500 text-sm mt-1">Passport returned to candidate</p>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-slate-300">Activity Log</h3>
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : logs.length === 0 ? (
              <p className="text-center text-slate-600 py-8 text-sm">No activity yet</p>
            ) : (
              <ul>
                {logs.map((log, i) => (
                  <li key={log.id} className={`px-4 py-3 ${i < logs.length - 1 ? 'border-b border-slate-800' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-slate-200 text-xs font-semibold capitalize">{log.from_status?.replaceAll('_', ' ')} → {log.to_status?.replaceAll('_', ' ')}</p>
                      <p className="text-slate-600 text-[10px]">{new Date(log.changed_at).toLocaleDateString()}</p>
                    </div>
                    {log.note && <p className="text-slate-500 text-xs">{log.note}</p>}
                    <p className="text-slate-600 text-[10px] mt-1">by {log.profiles?.full_name}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {showEdit && (
        <EditPassportModal
          passport={passport}
          onClose={() => setShowEdit(false)}
          onSaved={handleEdited}
        />
      )}
    </>
  )
}

PassportDetail.propTypes = {
  passport: PropTypes.shape({
    id: PropTypes.string.isRequired,
    passport_no: PropTypes.string,
    status: PropTypes.string,
    issue_date: PropTypes.string,
    expiry_date: PropTypes.string,
    place_of_issue: PropTypes.string,
    current_location: PropTypes.string,
    candidates: PropTypes.shape({
      full_name: PropTypes.string,
      phone: PropTypes.string,
    }),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdated: PropTypes.func.isRequired,
}
