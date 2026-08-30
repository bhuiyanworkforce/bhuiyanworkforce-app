import PropTypes from 'prop-types'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/Modal'
import { UploadCloud, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

const STEP_UPLOAD = 'upload'
const STEP_PREVIEW = 'preview'
const STEP_IMPORTING = 'importing'
const STEP_DONE = 'done'

// Accepts several reasonable header spellings per field so a real-world
// spreadsheet someone already has doesn't need to be reformatted first.
const HEADER_ALIASES = {
  full_name: ['full name', 'name', 'full_name', 'candidate name'],
  phone: ['phone', 'phone number', 'mobile', 'phone_no', 'contact'],
  nationality: ['nationality', 'country'],
  address: ['address', 'present address', 'current address'],
  date_of_birth: ['date of birth', 'dob', 'date_of_birth', 'birth date'],
  agent: ['agent', 'agent name', 'assigned agent'],
}

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase()
}

function findField(row, field) {
  const aliases = HEADER_ALIASES[field]
  for (const key of Object.keys(row)) {
    if (aliases.includes(normalizeHeader(key))) return row[key]
  }
  return undefined
}

function toDateString(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  // Already a plain string like "1990-05-12" or "12/05/1990" — leave
  // basic ISO-looking strings alone, otherwise don't guess.
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

export default function ImportCandidatesModal({ open, onClose, onImported }) {
  const [step, setStep] = useState(STEP_UPLOAD)
  const [rows, setRows] = useState([])
  const [fileError, setFileError] = useState('')
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [results, setResults] = useState({ imported: 0, skipped: 0, failed: [] })
  const [progress, setProgress] = useState(0)

  function reset() {
    setStep(STEP_UPLOAD)
    setRows([])
    setFileError('')
    setSkipDuplicates(true)
    setResults({ imported: 0, skipped: 0, failed: [] })
    setProgress(0)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError('')

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
      const firstSheetName = workbook.SheetNames[0]
      if (!firstSheetName) throw new Error('The file has no sheets.')
      const sheet = workbook.Sheets[firstSheetName]
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      if (raw.length === 0) throw new Error('No rows found in the first sheet.')

      // Pull existing candidates (phone + name + archived state) once, so
      // every row can be checked against it without one query per row.
      const { data: existing } = await supabase
        .from('candidates')
        .select('phone, full_name, archived_at')
        .not('phone', 'is', null)
      const existingByPhone = new Map()
      for (const c of existing || []) {
        const key = String(c.phone).trim()
        if (key) existingByPhone.set(key, c)
      }

      const { data: agents } = await supabase.from('agents').select('id, full_name')
      const agentByName = new Map((agents || []).map(a => [normalizeHeader(a.full_name), a.id]))

      const parsed = raw.map((row, i) => {
        const full_name = String(findField(row, 'full_name') || '').trim()
        const phone = String(findField(row, 'phone') || '').trim()
        const nationality = String(findField(row, 'nationality') || '').trim() || null
        const address = String(findField(row, 'address') || '').trim() || null
        const date_of_birth = toDateString(findField(row, 'date_of_birth'))
        const agentNameRaw = String(findField(row, 'agent') || '').trim()
        const agent_id = agentNameRaw ? agentByName.get(normalizeHeader(agentNameRaw)) || null : null
        const agentUnmatched = agentNameRaw && !agent_id

        const duplicate = phone ? existingByPhone.get(phone) : null

        let status = 'ready'
        let reason = ''
        if (!full_name) { status = 'invalid'; reason = 'Missing full name' }
        else if (duplicate) { status = 'duplicate'; reason = `Already exists: ${duplicate.full_name}${duplicate.archived_at ? ' (archived)' : ''}` }
        else if (agentUnmatched) { reason = `Agent "${agentNameRaw}" not found — will import without an agent` }

        return {
          rowNumber: i + 2, // +2 accounts for header row + 1-indexing, matches what they'd see in Excel
          full_name, phone, nationality, address, date_of_birth, agent_id,
          status, reason,
        }
      })

      setRows(parsed)
      setStep(STEP_PREVIEW)
    } catch (err) {
      setFileError(`Could not read file: ${err.message}`)
    }
  }

  async function handleImport() {
    setStep(STEP_IMPORTING)
    setProgress(0)

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) {
      setFileError('Your session has expired. Please log in again.')
      setStep(STEP_PREVIEW)
      return
    }

    const toImport = rows.filter(r => r.status === 'ready' || (r.status === 'duplicate' && !skipDuplicates))
    const skippedCount = rows.filter(r => r.status === 'duplicate' && skipDuplicates).length
    const invalidCount = rows.filter(r => r.status === 'invalid').length
    const failed = []
    let imported = 0

    // Inserted one row at a time rather than a single bulk insert — this
    // means one bad row can't poison an entire batch, and every failure
    // can be reported against the exact spreadsheet row it came from,
    // rather than one opaque error for the whole import.
    for (const row of toImport) {
      const { error } = await supabase.from('candidates').insert({
        full_name: row.full_name,
        phone: row.phone || null,
        nationality: row.nationality,
        address: row.address,
        date_of_birth: row.date_of_birth,
        agent_id: row.agent_id,
        created_by: user.id,
      })
      if (error) {
        failed.push({ rowNumber: row.rowNumber, full_name: row.full_name, message: error.message })
      } else {
        imported++
      }
      setProgress(p => p + 1)
    }

    setResults({ imported, skipped: skippedCount + invalidCount, failed })
    setStep(STEP_DONE)
    if (imported > 0) onImported()
  }

  const readyCount = rows.filter(r => r.status === 'ready').length
  const duplicateCount = rows.filter(r => r.status === 'duplicate').length
  const invalidCount = rows.filter(r => r.status === 'invalid').length
  const willImportCount = readyCount + (skipDuplicates ? 0 : duplicateCount)

  return (
    <Modal open={open} onClose={handleClose} title="Import Candidates">
      <div className="p-5 flex flex-col gap-4">

        {step === STEP_UPLOAD && (
          <>
            <p className="text-xs text-slate-400 leading-relaxed">
              Upload an Excel (.xlsx) or CSV file. The first row should be column headers.
              Expected columns: <span className="text-slate-200 font-semibold">Full Name</span> (required),
              Phone, Nationality, Address, Date of Birth, Agent.
            </p>
            {fileError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl px-4 py-3">{fileError}</div>
            )}
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-700 rounded-xl py-10 cursor-pointer hover:border-indigo-500 transition-colors">
              <UploadCloud size={28} className="text-slate-500" />
              <span className="text-sm text-slate-400">Tap to choose a file</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            </label>
          </>
        )}

        {step === STEP_PREVIEW && (
          <>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="bg-emerald-500/15 text-emerald-400 px-3 py-1.5 rounded-full">{readyCount} ready</span>
              {duplicateCount > 0 && <span className="bg-amber-500/15 text-amber-400 px-3 py-1.5 rounded-full">{duplicateCount} possible duplicates</span>}
              {invalidCount > 0 && <span className="bg-red-500/15 text-red-400 px-3 py-1.5 rounded-full">{invalidCount} invalid</span>}
            </div>

            {duplicateCount > 0 && (
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} />
                Skip possible duplicates ({duplicateCount} row{duplicateCount !== 1 ? 's' : ''})
              </label>
            )}

            <div className="max-h-72 overflow-y-auto flex flex-col gap-1.5 border border-slate-800 rounded-xl p-2">
              {rows.map(r => (
                <div key={r.rowNumber} className="flex items-start gap-2 text-xs px-2 py-1.5 rounded-lg bg-slate-900">
                  {r.status === 'ready' && <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />}
                  {r.status === 'duplicate' && <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />}
                  {r.status === 'invalid' && <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <p className="text-slate-200 font-semibold truncate">Row {r.rowNumber}: {r.full_name || '(no name)'}</p>
                    {r.reason && <p className="text-slate-500">{r.reason}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={reset} className="px-4 py-3 bg-slate-800 border border-slate-700 text-slate-400 rounded-xl text-sm font-semibold">
                Choose Different File
              </button>
              <button onClick={handleImport} disabled={willImportCount === 0}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3 rounded-xl disabled:opacity-40 text-sm">
                Import {willImportCount} Candidate{willImportCount !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {step === STEP_IMPORTING && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 size={28} className="text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-400">Importing {progress} of {willImportCount}...</p>
          </div>
        )}

        {step === STEP_DONE && (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-emerald-400 text-sm font-bold">{results.imported} candidate{results.imported !== 1 ? 's' : ''} imported</p>
              {results.skipped > 0 && <p className="text-slate-500 text-xs">{results.skipped} row{results.skipped !== 1 ? 's' : ''} skipped (duplicate or invalid)</p>}
              {results.failed.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex flex-col gap-1">
                  <p className="text-red-400 text-xs font-bold">{results.failed.length} row{results.failed.length !== 1 ? 's' : ''} failed:</p>
                  {results.failed.map(f => (
                    <p key={f.rowNumber} className="text-red-400/80 text-xs">Row {f.rowNumber} ({f.full_name}): {f.message}</p>
                  ))}
                </div>
              )}
            </div>
            <button onClick={handleClose} className="w-full bg-slate-800 text-slate-200 font-bold py-3 rounded-xl text-sm">
              Done
            </button>
          </>
        )}

      </div>
    </Modal>
  )
}

ImportCandidatesModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onImported: PropTypes.func.isRequired,
}
