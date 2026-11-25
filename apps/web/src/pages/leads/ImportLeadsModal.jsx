import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { X, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const SOURCE_TYPES = ['registry', 'job_board', 'referral', 'event', 'website', 'other']
const BATCH = 50

// Header aliases, matched after lowercasing and stripping non-letters/digits.
const ALIASES = {
  company_name:  ['company', 'companyname', 'businessname', 'employer', 'organisation', 'organization'],
  country:       ['country'],
  industry:      ['industry', 'sector'],
  website:       ['website', 'web', 'site', 'url'],
  contact_name:  ['contactname', 'contactperson', 'person'],
  contact_role:  ['contactrole', 'role', 'title', 'position', 'jobtitle'],
  contact_email: ['email', 'contactemail', 'emailaddress', 'sendtoemail', 'sendto'],
  contact_phone: ['phone', 'contactphone', 'mobile', 'phonenumber', 'whatsapp', 'phonefromsheet'],
  roles_needed:  ['rolesneeded', 'roles', 'vacancies', 'positions'],
  source_url:    ['sourceurl', 'source', 'sourcelink', 'link'],
  notes:         ['notes', 'note', 'remarks'],
}

const inputClass = 'bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500'

function norm(h) { return String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') }
function clean(v) { const s = String(v ?? '').trim(); return s || null }
function keyOf(name, country) { return `${String(name).trim().toLowerCase()}|${String(country ?? '').trim().toLowerCase()}` }
function looksLikeEmail(v) { const s = String(v ?? ''); const at = s.indexOf('@'); return at > 0 && s.lastIndexOf('.') > at + 1 && !s.includes(' ') }

function mapRow(raw) {
  const byHeader = {}
  for (const [h, v] of Object.entries(raw)) byHeader[norm(h)] = v
  const out = {}
  for (const [field, names] of Object.entries(ALIASES)) {
    const hit = names.find(n => byHeader[n] !== undefined && String(byHeader[n]).trim() !== '')
    out[field] = hit ? clean(byHeader[hit]) : null
  }
  // A cell can hold several numbers ("+30 123; +30 456"). Keep the first one.
  if (out.contact_phone) out.contact_phone = clean(out.contact_phone.split(/[;,/]/)[0])
  return out
}

export default function ImportLeadsModal({ onClose, onImported }) {
  const [rows, setRows] = useState(null)        // parsed, unclassified rows
  const [fileName, setFileName] = useState('')
  const [defaultSource, setDefaultSource] = useState('')
  const [defaultCountry, setDefaultCountry] = useState('')
  const [sourceType, setSourceType] = useState('other')
  const [existing, setExisting] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      if (raw.length === 0) throw new Error('The first sheet has no rows')
      if (raw.length > 1000) throw new Error('Import up to 1000 rows at a time')

      const [leadRes, empRes] = await Promise.all([
        supabase.from('employer_leads').select('company_name, country'),
        supabase.from('employers').select('company_name, country'),
      ])
      if (leadRes.error) throw leadRes.error
      if (empRes.error) throw empRes.error
      setExisting(new Set([...(leadRes.data ?? []), ...(empRes.data ?? [])].map(r => keyOf(r.company_name, r.country))))

      setRows(raw.map(mapRow))
      setFileName(file.name)
    } catch (err) {
      setRows(null)
      setError(err.message || 'Could not read that file')
    } finally {
      setBusy(false)
    }
  }

  // Classify on every render so changing the default source updates the counts.
  const seen = new Set()
  const classified = (rows ?? []).map(r => {
    if (!r.company_name) return { r, status: 'skip', reason: 'no company name' }
    const source_url = r.source_url || clean(defaultSource)
    if (!source_url) return { r, status: 'skip', reason: 'no source' }
    const country = r.country || clean(defaultCountry)
    const key = keyOf(r.company_name, country)
    if (existing.has(key)) return { r, status: 'dup', reason: 'already in leads or employers' }
    if (seen.has(key)) return { r, status: 'dup', reason: 'repeated in this file' }
    seen.add(key)
    return { r: { ...r, source_url, country }, status: 'new', reason: '' }
  })
  const fresh = classified.filter(x => x.status === 'new')
  const dups = classified.filter(x => x.status === 'dup').length
  const skipped = classified.filter(x => x.status === 'skip')
  const noSource = skipped.filter(x => x.reason === 'no source').length
  const droppedEmails = fresh.filter(x => x.r.contact_email && !looksLikeEmail(x.r.contact_email)).length

  async function handleImport() {
    setBusy(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) throw new Error('Your session has expired. Please log in again.')

      const payload = fresh.map(({ r }) => ({
        ...r,
        contact_email: looksLikeEmail(r.contact_email) ? r.contact_email.toLowerCase() : null,
        source_type: sourceType,
        created_by: user.id,
      }))

      let added = 0
      let failed = 0
      for (let i = 0; i < payload.length; i += BATCH) {
        const chunk = payload.slice(i, i + BATCH)
        const { error: err } = await supabase.from('employer_leads').insert(chunk)
        if (!err) { added += chunk.length; continue }
        // One bad row fails the whole batch, so retry row by row.
        for (const row of chunk) {
          const { error: rowErr } = await supabase.from('employer_leads').insert(row)
          if (rowErr) failed += 1
          else added += 1
        }
      }
      setResult({ added, failed })
      if (added > 0) onImported(added)
    } catch (err) {
      setError(err.message || 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div role="dialog" aria-modal="true" aria-labelledby="import-leads-title" className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto mb-16">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 id="import-leads-title" className="text-slate-100 font-bold text-lg">Import Leads</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={20} className="text-slate-400" /></button>
        </div>

        <div className="p-5 pb-10 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}

          {result ? (
            <>
              <p className="text-emerald-400 text-sm bg-emerald-500/10 px-4 py-3 rounded-xl">
                Added {result.added} lead{result.added === 1 ? '' : 's'}.{result.failed > 0 ? ` ${result.failed} could not be saved.` : ''}
              </p>
              <button type="button" onClick={onClose} className="w-full bg-slate-800 text-slate-200 py-3 rounded-xl font-bold text-sm">Done</button>
            </>
          ) : (
            <>
              <p className="text-slate-500 text-xs">
                Upload an Excel or CSV file with a header row. Recognised columns: company, country, industry, website,
                contact name, role, email (or "Send to (email)"), phone, roles needed, source, notes. Every lead needs a source, either in its row or in the box below.
                Companies already in Leads or Employers are skipped.
              </p>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-semibold">Source for rows that have none (link or note)</span>
                <input value={defaultSource} onChange={e => setDefaultSource(e.target.value)} placeholder="e.g. Romania hiring list, Nov 2026" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-semibold">Country for rows that have none</span>
                <input value={defaultCountry} onChange={e => setDefaultCountry(e.target.value)} placeholder="e.g. Greece" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-semibold">Found through</span>
                <select value={sourceType} onChange={e => setSourceType(e.target.value)} className={inputClass}>
                  {SOURCE_TYPES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </label>

              <label className="flex items-center justify-center gap-2 border border-dashed border-slate-700 rounded-xl py-4 text-slate-400 text-sm cursor-pointer">
                <Upload size={16} /> {fileName || 'Choose .xlsx or .csv file'}
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              </label>

              {rows && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm flex flex-col gap-1">
                  <p className="text-slate-200"><span className="font-bold text-emerald-400">{fresh.length}</span> ready to add</p>
                  <p className="text-slate-400">{dups} duplicate{dups === 1 ? '' : 's'} skipped</p>
                  <p className="text-slate-400">{skipped.length} skipped for missing data{noSource > 0 ? ` (${noSource} have no source)` : ''}</p>
                  {droppedEmails > 0 && <p className="text-amber-400">{droppedEmails} invalid email{droppedEmails === 1 ? '' : 's'} will be left blank</p>}
                </div>
              )}

              <button type="button" onClick={handleImport} disabled={busy || fresh.length === 0}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50">
                {busy ? 'Working…' : `Import ${fresh.length || ''} lead${fresh.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

ImportLeadsModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onImported: PropTypes.func.isRequired,
}
