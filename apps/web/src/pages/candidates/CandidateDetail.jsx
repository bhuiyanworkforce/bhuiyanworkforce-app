import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { X, Stamp, Receipt, Phone, Globe, Calendar, Paperclip, Trash2, ChevronDown, Edit2 } from 'lucide-react'
import EditCandidateModal from './EditCandidateModal'

const PIPELINE_STAGES = [
  { key: 'new',           label: 'New',            color: 'bg-slate-500/15 text-slate-400'     },
  { key: 'screening',     label: 'Screening',      color: 'bg-blue-500/15 text-blue-400'       },
  { key: 'interview',     label: 'Interview',      color: 'bg-yellow-500/15 text-yellow-400'   },
  { key: 'medical',       label: 'Medical',        color: 'bg-orange-500/15 text-orange-400'   },
  { key: 'documents',     label: 'Documents',      color: 'bg-purple-500/15 text-purple-400'   },
  { key: 'visa_applied',  label: 'Visa Applied',   color: 'bg-indigo-500/15 text-indigo-400'   },
  { key: 'visa_approved', label: 'Visa Approved',  color: 'bg-teal-500/15 text-teal-400'       },
  { key: 'traveling',     label: 'Traveling',      color: 'bg-emerald-500/15 text-emerald-400' },
  { key: 'placed',        label: 'Placed',         color: 'bg-green-500/15 text-green-400'     },
  { key: 'cancelled',     label: 'Cancelled',      color: 'bg-red-500/15 text-red-400'         },
]

function stageColor(s) { return PIPELINE_STAGES.find(p => p.key === s)?.color || 'bg-slate-500/15 text-slate-400' }
function stageLabel(s) { return PIPELINE_STAGES.find(p => p.key === s)?.label || 'New' }

// FIX L246: move fileSuffix to outer scope (javascript/optimization)
function fileSuffix(count) {
  return count !== 1 ? 's' : ''
}

const STATUS_COLOR_P = {
  received:   'bg-slate-500/15 text-slate-400',
  processing: 'bg-blue-500/15 text-blue-400',
  delivered:  'bg-emerald-500/15 text-emerald-400',
  cancelled:  'bg-red-500/15 text-red-400',
}
const STATUS_COLOR_I = {
  paid:    'bg-emerald-500/15 text-emerald-400',
  unpaid:  'bg-red-500/15 text-red-400',
  partial: 'bg-amber-500/15 text-amber-400',
}

export default function CandidateDetail({ candidate: initialCandidate, onClose }) {
  const [candidate, setCandidate]     = useState(initialCandidate)
  const [passports, setPassports]     = useState([])
  const [invoices, setInvoices]       = useState([])
  const [documents, setDocuments]     = useState([])
  const [uploading, setUploading]     = useState(false)
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState('passports')
  const [showStageMenu, setShowStageMenu] = useState(false)
  const [updatingStage, setUpdatingStage] = useState(false)
  const [showEdit, setShowEdit]       = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: inv }, { data: docs }] = await Promise.all([
        supabase.from('passports').select('*').eq('candidate_id', candidate.id).order('created_at', { ascending: false }),
        supabase.from('invoices').select('*').eq('candidate_id', candidate.id).order('issued_at', { ascending: false }),
        supabase.from('candidate_documents').select('*').eq('candidate_id', candidate.id).order('created_at', { ascending: false }),
      ])
      setPassports(p || [])
      setInvoices(inv || [])
      setDocuments(docs || [])
      setLoading(false)
    }
    load()
  }, [candidate.id])

  async function uploadDoc(file) {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${candidate.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
    if (upErr) { alert(upErr.message); setUploading(false); return }
    const { error: dbErr } = await supabase.from('candidate_documents').insert({
      candidate_id: candidate.id,
      name: file.name,
      storage_path: path,
      type: ext.toUpperCase(),
    })
    if (dbErr) { alert(dbErr.message); setUploading(false); return }
    const { data: docs } = await supabase.from('candidate_documents')
      .select('*').eq('candidate_id', candidate.id).order('created_at', { ascending: false })
    setDocuments(docs || [])
    setUploading(false)
  }

  async function deleteDoc(doc) {
    if (!confirm(`Delete "${doc.name}"?`)) return
    await supabase.storage.from('documents').remove([doc.storage_path])
    await supabase.from('candidate_documents').delete().eq('id', doc.id)
    setDocuments(prev => prev.filter(d => d.id !== doc.id))
  }

  async function downloadDoc(doc) {
    const { data } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function updateStage(newStage) {
    setUpdatingStage(true)
    const { error } = await supabase.from('candidates').update({ status: newStage }).eq('id', candidate.id)
    if (error) { alert(error.message); setUpdatingStage(false); return }
    setCandidate(prev => ({ ...prev, status: newStage }))
    setShowStageMenu(false)
    setUpdatingStage(false)
  }

  function handleEditSaved(updated) {
    setCandidate(prev => ({ ...prev, ...updated }))
    setShowEdit(false)
  }

  // FIX L341 & L343: extract nested ternary tab-content logic into independent statements
  function renderTabContent() {
    if (tab === 'passports') {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {passports.length === 0
            ? <p className="text-center text-slate-600 py-10 text-sm">No passports linked</p>
            : <ul>{passports.map((p, i) => (
                <li key={p.id} className={`flex items-center justify-between px-4 py-4 ${i < passports.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Stamp size={14} className="text-indigo-400"/>
                      <p className="text-slate-200 text-sm font-semibold font-mono">{p.passport_no}</p>
                    </div>
                    <p className="text-slate-500 text-xs">
                      {p.place_of_issue || p.issue_country || '—'} · Exp: {p.expiry_date ? new Date(p.expiry_date).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  {/* FIX L57: String#replaceAll() over String#replace() */}
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLOR_P[p.status] || 'bg-indigo-500/15 text-indigo-400'}`}>
                    {p.status?.replaceAll('_', ' ')}
                  </span>
                </li>
              ))}</ul>
          }
        </div>
      )
    }

    if (tab === 'invoices') {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {invoices.length === 0
            ? <p className="text-center text-slate-600 py-10 text-sm">No invoices yet</p>
            : <ul>{invoices.map((inv, i) => (
                <li key={inv.id} className={`flex items-center justify-between px-4 py-4 ${i < invoices.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Receipt size={14} className="text-indigo-400"/>
                      <p className="text-indigo-400 text-xs font-mono font-semibold">{inv.invoice_no}</p>
                    </div>
                    <p className="text-slate-500 text-xs">{new Date(inv.issued_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-white font-bold text-sm">৳{parseFloat(inv.total || 0).toLocaleString()}</p>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLOR_I[inv.status] || 'bg-slate-700 text-slate-300'}`}>
                      {inv.status}
                    </span>
                  </div>
                </li>
              ))}</ul>
          }
        </div>
      )
    }

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <p className="text-slate-400 text-xs font-semibold">{documents.length} file{fileSuffix(documents.length)}</p>
          <label className={`text-xs font-bold cursor-pointer ${uploading ? 'text-slate-500' : 'text-indigo-400'}`}>
            {uploading ? 'Uploading...' : '+ Upload'}
            <input type="file" className="hidden" disabled={uploading}
              onChange={e => { if (e.target.files[0]) uploadDoc(e.target.files[0]) }}/>
          </label>
        </div>
        {documents.length === 0
          ? <p className="text-center text-slate-600 py-10 text-sm">No documents uploaded</p>
          : <ul>{documents.map((doc, i) => (
              <li key={doc.id} className={`flex items-center justify-between px-4 py-3 ${i < documents.length - 1 ? 'border-b border-slate-800' : ''}`}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Paperclip size={14} className="text-slate-400 flex-none"/>
                  <button onClick={() => downloadDoc(doc)}
                    className="text-slate-200 text-sm truncate text-left hover:text-indigo-400 transition-colors">
                    {doc.name}
                  </button>
                </div>
                <div className="flex items-center gap-3 flex-none">
                  {doc.type && <span className="text-slate-600 text-xs">{doc.type}</span>}
                  <button onClick={() => deleteDoc(doc)}>
                    <Trash2 size={14} className="text-red-400"/>
                  </button>
                </div>
              </li>
            ))}</ul>
        }
      </div>
    )
  }

  const candidateStatus = candidate.status || 'new'

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[#050D1A] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800 bg-[#080F1E]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
            <h2 className="text-slate-100 font-bold text-base truncate">{candidate.full_name}</h2>
          </div>
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors flex-none"
          >
            <Edit2 size={13}/> Edit
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-5 flex flex-col gap-4">
          {/* Info card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between mb-1">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 font-bold text-2xl">
                {candidate.full_name?.[0]?.toUpperCase()}
              </div>
              {/* Pipeline stage picker */}
              <div className="relative">
                <button
                  onClick={() => setShowStageMenu(p => !p)}
                  disabled={updatingStage}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${stageColor(candidateStatus)}`}
                >
                  {stageLabel(candidateStatus)}
                  <ChevronDown size={12}/>
                </button>
                {showStageMenu && (
                  <div className="absolute right-0 top-9 z-50 bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-xl w-44">
                    {PIPELINE_STAGES.map(s => (
                      <button key={s.key} onClick={() => updateStage(s.key)}
                        className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors hover:bg-slate-800 ${candidateStatus === s.key ? 'text-indigo-400' : 'text-slate-300'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {candidate.phone && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Phone size={14}/> {candidate.phone}
              </div>
            )}
            {candidate.nationality && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Globe size={14}/> {candidate.nationality}
              </div>
            )}
            {(candidate.date_of_birth || candidate.dob) && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Calendar size={14}/>
                {new Date(candidate.date_of_birth || candidate.dob).toLocaleDateString()}
              </div>
            )}
            {candidate.address && (
              <p className="text-slate-500 text-xs mt-1">{candidate.address}</p>
            )}
            {candidate.agents?.full_name && (
              <p className="text-indigo-400 text-xs font-semibold mt-1">
                Agent: {candidate.agents.full_name}
              </p>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {['passports', 'invoices', 'documents'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold capitalize whitespace-nowrap transition-colors ${tab === t ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {t}
                {t === 'passports'  && passports.length  > 0 && ` (${passports.length})`}
                {t === 'invoices'   && invoices.length   > 0 && ` (${invoices.length})`}
                {t === 'documents'  && documents.length  > 0 && ` (${documents.length})`}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : (
            renderTabContent()
          )}
        </div>
      </div>

      {/* Edit Modal — renders on top */}
      {showEdit && (
        <EditCandidateModal
          candidate={candidate}
          onClose={() => setShowEdit(false)}
          onSaved={handleEditSaved}
        />
      )}
    </>
  )
}

// PropTypes
CandidateDetail.propTypes = {
  candidate: PropTypes.shape({
    id: PropTypes.string.isRequired,
    full_name: PropTypes.string,
    status: PropTypes.string,
    phone: PropTypes.string,
    nationality: PropTypes.string,
    date_of_birth: PropTypes.string,
    dob: PropTypes.string,
    address: PropTypes.string,
    agents: PropTypes.shape({ full_name: PropTypes.string }),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
}
