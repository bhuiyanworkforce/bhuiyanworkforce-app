import PropTypes from 'prop-types'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  Upload, Scan, X, Check, ChevronRight,
  User, FileText, Briefcase, AlertCircle,
  Loader, ImageIcon, ArrowLeft
} from 'lucide-react'
import Modal from '../../components/Modal'

// ── Step constants ────────────────────────────────────────────
const STEP_UPLOAD   = 'upload'
const STEP_REVIEW   = 'review'
const STEP_CATEGORY = 'category'
const STEP_SAVING   = 'saving'
const STEP_DONE     = 'done'

// ── MRZ parser (same logic as OCRScanner.jsx) ─────────────────
function parseMRZ(text) {
  const lines = text.split('\n')
    .map(l => l.replaceAll(/[^A-Z0-9<]/g, '').trim())
    .filter(l => l.length >= 30)

  let line1 = ''
  let line2 = ''
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].length >= 40 && lines[i + 1].length >= 40) {
      line1 = lines[i].padEnd(44, '<').slice(0, 44)
      line2 = lines[i + 1].padEnd(44, '<').slice(0, 44)
      break
    }
  }

  if (!line1 || !line2) {
    const long = lines.find(l => l.length >= 40)
    if (!long) return null
    line2 = long.padEnd(44, '<').slice(0, 44)
  }

  const passportNo  = line2.slice(0, 9).replaceAll('<', '')
  const dobRaw      = line2.slice(13, 19)
  const expiryRaw   = line2.slice(21, 27)
  const nationality = line2.slice(10, 13).replaceAll('<', '')

  let fullName = ''
  if (line1.length >= 43) {
    const namePart = line1.slice(5, 44)
    const parts    = namePart.split('<<')
    const surname  = parts[0]?.replaceAll('<', ' ').trim() ?? ''
    const given    = parts[1]?.replaceAll('<', ' ').trim() ?? ''
    fullName = given ? `${given} ${surname}` : surname
  }

  function mrzDate(raw) {
    if (!raw || raw.length < 6) return ''
    const yy   = Number.parseInt(raw.slice(0, 2), 10)
    const mm   = raw.slice(2, 4)
    const dd   = raw.slice(4, 6)
    const year = yy > 30 ? 1900 + yy : 2000 + yy
    return `${year}-${mm}-${dd}`
  }

  if (!passportNo || passportNo.length < 5) return null

  return {
    passport_no:   passportNo,
    full_name:     fullName || null,
    date_of_birth: mrzDate(dobRaw),
    expiry_date:   mrzDate(expiryRaw),
    nationality:   nationality || null,
  }
}

// ── Field component ───────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', placeholder = '', required = false }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
      />
    </div>
  )
}

Field.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  type: PropTypes.string,
  placeholder: PropTypes.string,
  required: PropTypes.bool,
}

// ── Step indicator ────────────────────────────────────────────
function Steps({ current }) {
  const steps = [
    { key: STEP_UPLOAD,   label: 'Upload' },
    { key: STEP_REVIEW,   label: 'Review' },
    { key: STEP_CATEGORY, label: 'Job' },
  ]
  const idx = steps.findIndex(s => s.key === current)

  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center flex-1">
          <div className={`
            flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 transition-colors
            ${i < idx  ? 'bg-indigo-500 text-white' : ''}
            ${i === idx ? 'bg-indigo-500 text-white ring-2 ring-indigo-400/40' : ''}
            ${i > idx  ? 'bg-slate-800 text-slate-500 border border-slate-700' : ''}
          `}>
            {i < idx ? <Check size={12} /> : i + 1}
          </div>
          <span className={`ml-1.5 text-xs font-medium ${i <= idx ? 'text-slate-200' : 'text-slate-600'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className={`flex-1 mx-2 h-px ${i < idx ? 'bg-indigo-500' : 'bg-slate-700'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

Steps.propTypes = { current: PropTypes.string.isRequired }

// ── Main component ────────────────────────────────────────────
export default function SmartPassportUpload({ open, onClose, onSaved }) {
  const { user } = useAuth()
  const fileRef  = useRef(null)
  const mountRef = useRef(true)
  const workerRef = useRef(null)

  const [step, setStep]         = useState(STEP_UPLOAD)
  const [preview, setPreview]   = useState(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [categories, setCategories] = useState([])
  const [selectedCat, setSelectedCat] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [savedData, setSavedData] = useState(null)

  const [form, setForm] = useState({
    full_name:     '',
    passport_no:   '',
    date_of_birth: '',
    expiry_date:   '',
    nationality:   'Bangladeshi',
    issue_date:    '',
    place_of_issue:'',
    phone:         '',
    address:       '',
  })

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Load categories when modal opens
  useEffect(() => {
    if (!open) return
    reset()
    supabase
      .from('job_categories')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setCategories(data || []))
  }, [open])

  useEffect(() => {
    mountRef.current = true
    return () => {
      mountRef.current = false
      workerRef.current?.terminate()
    }
  }, [])

  function reset() {
    setStep(STEP_UPLOAD)
    setPreview(null)
    setScanning(false)
    setScanError('')
    setSelectedCat(null)
    setSaveError('')
    setSavedData(null)
    setForm({
      full_name: '', passport_no: '', date_of_birth: '',
      expiry_date: '', nationality: 'Bangladeshi',
      issue_date: '', place_of_issue: '', phone: '', address: '',
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── OCR processing ──────────────────────────────────────────
  async function processFile(file) {
    if (!mountRef.current) return

    // For PDFs, skip OCR (can't run in browser without paid lib) — user fills manually
    if (file.type === 'application/pdf') {
      const url = URL.createObjectURL(file)
      setPreview(url)
      setScanError('PDF uploaded. Please fill in the passport details below manually.')
      setStep(STEP_REVIEW)
      return
    }

    setScanning(true)
    setScanError('')

    const url = URL.createObjectURL(file)
    setPreview(url)

    try {
      const Tesseract = (await import('tesseract.js')).default
      const worker = await Tesseract.createWorker('eng', 1, { logger: () => {} })
      workerRef.current = worker

      const { data: { text } } = await worker.recognize(file, {
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789< ',
      })

      await worker.terminate()
      workerRef.current = null

      if (!mountRef.current) return

      const result = parseMRZ(text)
      if (result) {
        setForm(p => ({
          ...p,
          passport_no:   result.passport_no   || p.passport_no,
          full_name:     result.full_name      || p.full_name,
          date_of_birth: result.date_of_birth  || p.date_of_birth,
          expiry_date:   result.expiry_date    || p.expiry_date,
          nationality:   result.nationality    || p.nationality,
        }))
        setScanError('')
      } else {
        setScanError('Could not auto-read passport data — please fill in the fields below manually.')
      }
    } catch (err) {
      if (mountRef.current) setScanError(`Scan failed: ${err.message}. Please fill in manually.`)
    } finally {
      if (mountRef.current) setScanning(false)
    }

    setStep(STEP_REVIEW)
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  // ── Save ────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.full_name || !form.passport_no) {
      setSaveError('Full name and passport number are required')
      return
    }

    setStep(STEP_SAVING)
    setSaveError('')

    try {
      // 1. Create candidate
      const { data: candidate, error: cErr } = await supabase
        .from('candidates')
        .insert({
          full_name:       form.full_name.trim(),
          phone:           form.phone || null,
          nationality:     form.nationality || null,
          address:         form.address || null,
          date_of_birth:   form.date_of_birth || null,
          job_category_id: selectedCat?.id || null,
          created_by:      user?.id,
        })
        .select()
        .single()

      if (cErr) throw cErr

      // 2. Create passport linked to candidate
      const { error: pErr } = await supabase
        .from('passports')
        .insert({
          candidate_id:   candidate.id,
          passport_no:    form.passport_no.trim().toUpperCase(),
          issue_date:     form.issue_date || null,
          expiry_date:    form.expiry_date || null,
          place_of_issue: form.place_of_issue || null,
          current_location: 'Office',
          status:         'received',
          created_by:     user?.id,
        })

      if (pErr) throw pErr

      setSavedData({ candidate, category: selectedCat })
      setStep(STEP_DONE)
      onSaved()

    } catch (err) {
      setSaveError(err.message)
      setStep(STEP_REVIEW)
    }
  }

  // ── Render ──────────────────────────────────────────────────
  function renderContent() {

    // STEP: UPLOAD
    if (step === STEP_UPLOAD) {
      return (
        <div>
          <Steps current={step} />
          <p className="text-slate-400 text-sm mb-5 text-center">
            Upload a passport image or PDF — details will be auto-filled from the MRZ zone.
          </p>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-indigo-500/60 rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-colors group"
          >
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
              <Upload size={28} className="text-indigo-400" />
            </div>
            <div className="text-center">
              <p className="text-slate-200 font-semibold">Drop passport here</p>
              <p className="text-slate-500 text-xs mt-1">JPG, PNG, JPEG or PDF</p>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,application/pdf"
            onChange={handleFile}
            className="hidden"
          />

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-slate-600 text-xs">or</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          <button
            onClick={() => { fileRef.current?.click() }}
            className="flex items-center justify-center gap-2 w-full bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            <ImageIcon size={16} /> Browse Files
          </button>
        </div>
      )
    }

    // STEP: REVIEW
    if (step === STEP_REVIEW) {
      return (
        <div>
          <Steps current={step} />

          {/* Preview thumbnail */}
          {preview && !preview.startsWith('blob:') || preview ? (
            <div className="relative mb-5">
              {form.passport_no && (
                <div className="absolute top-2 right-2 z-10 bg-emerald-500/90 text-white text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                  <Scan size={11} /> Auto-filled
                </div>
              )}
              <img
                src={preview}
                alt="passport"
                className="w-full max-h-36 object-cover rounded-xl border border-slate-700"
                onError={e => { e.target.style.display = 'none' }}
              />
            </div>
          ) : null}

          {/* Scan notification */}
          {scanning && (
            <div className="flex items-center gap-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3 mb-4">
              <Loader size={16} className="text-indigo-400 animate-spin shrink-0" />
              <p className="text-indigo-300 text-sm">Reading passport data…</p>
            </div>
          )}

          {scanError && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-4">
              <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-300 text-xs">{scanError}</p>
            </div>
          )}

          {saveError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl px-4 py-3 mb-4">
              {saveError}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <User size={14} className="text-indigo-400" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Candidate Details</span>
            </div>

            <Field label="Full Name" value={form.full_name} onChange={v => set('full_name', v)} placeholder="As on passport" required />
            <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="01XXXXXXXXX" />
            <Field label="Nationality" value={form.nationality} onChange={v => set('nationality', v)} />
            <Field label="Date of Birth" value={form.date_of_birth} onChange={v => set('date_of_birth', v)} type="date" />
            <Field label="Address" value={form.address} onChange={v => set('address', v)} placeholder="Current address" />

            <div className="flex items-center gap-2 mt-2 mb-1">
              <FileText size={14} className="text-violet-400" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Passport Details</span>
            </div>

            <Field label="Passport Number" value={form.passport_no} onChange={v => set('passport_no', v.toUpperCase())} placeholder="e.g. AB1234567" required />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Issue Date" value={form.issue_date} onChange={v => set('issue_date', v)} type="date" />
              <Field label="Expiry Date" value={form.expiry_date} onChange={v => set('expiry_date', v)} type="date" />
            </div>

            <Field label="Place of Issue" value={form.place_of_issue} onChange={v => set('place_of_issue', v)} placeholder="e.g. Dhaka" />
          </div>

          <div className="flex gap-3 mt-5">
            <button
              onClick={() => setStep(STEP_UPLOAD)}
              className="flex items-center gap-1.5 px-4 py-3 bg-slate-800 border border-slate-700 text-slate-400 rounded-xl text-sm font-semibold hover:text-slate-200 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={() => setStep(STEP_CATEGORY)}
              disabled={!form.full_name || !form.passport_no}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold py-3 rounded-xl disabled:opacity-40 text-sm"
            >
              Next: Select Job <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )
    }

    // STEP: CATEGORY
    if (step === STEP_CATEGORY) {
      return (
        <div>
          <Steps current={step} />

          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={14} className="text-indigo-400" />
            <p className="text-sm text-slate-300 font-semibold">Select Job Category</p>
            <span className="text-xs text-slate-600">(optional)</span>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1 mb-5">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(selectedCat?.id === cat.id ? null : cat)}
                className={`
                  flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left text-sm font-medium transition-all
                  ${selectedCat?.id === cat.id
                    ? 'bg-indigo-500/20 border-indigo-500/60 text-indigo-200'
                    : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-600'
                  }
                `}
              >
                <span className="text-lg leading-none">{cat.icon}</span>
                <span className="text-xs leading-tight">{cat.name}</span>
                {selectedCat?.id === cat.id && (
                  <Check size={12} className="ml-auto text-indigo-400 shrink-0" />
                )}
              </button>
            ))}
          </div>

          {selectedCat && (
            <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-2.5 mb-4">
              <span>{selectedCat.icon}</span>
              <span className="text-indigo-300 text-sm font-medium">{selectedCat.name}</span>
              <button onClick={() => setSelectedCat(null)} className="ml-auto text-slate-500 hover:text-slate-300">
                <X size={14} />
              </button>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(STEP_REVIEW)}
              className="flex items-center gap-1.5 px-4 py-3 bg-slate-800 border border-slate-700 text-slate-400 rounded-xl text-sm font-semibold hover:text-slate-200 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={handleSave}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"
            >
              <Check size={16} /> Save Candidate & Passport
            </button>
          </div>
        </div>
      )
    }

    // STEP: SAVING
    if (step === STEP_SAVING) {
      return (
        <div className="flex flex-col items-center gap-5 py-10">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Loader size={28} className="text-indigo-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-slate-200 font-semibold">Saving records…</p>
            <p className="text-slate-500 text-sm mt-1">Creating candidate and passport</p>
          </div>
        </div>
      )
    }

    // STEP: DONE
    if (step === STEP_DONE) {
      return (
        <div className="flex flex-col items-center gap-5 py-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Check size={28} className="text-emerald-400" />
          </div>
          <div className="text-center">
            <p className="text-slate-100 font-bold text-lg">All Done!</p>
            <p className="text-slate-400 text-sm mt-1">
              <span className="text-slate-200 font-semibold">{savedData?.candidate?.full_name}</span> has been added
              {savedData?.category && (
                <> to <span className="text-indigo-300 font-semibold">{savedData.category.icon} {savedData.category.name}</span></>
              )}
            </p>
          </div>

          <div className="w-full bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Candidate created</span>
              <span className="text-emerald-400 flex items-center gap-1"><Check size={12} /> Yes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Passport linked</span>
              <span className="text-emerald-400 flex items-center gap-1"><Check size={12} /> Yes</span>
            </div>
            {savedData?.category && (
              <div className="flex justify-between">
                <span className="text-slate-500">Job category</span>
                <span className="text-indigo-300">{savedData.category.icon} {savedData.category.name}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 w-full">
            <button
              onClick={reset}
              className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 font-semibold py-3 rounded-xl text-sm hover:border-slate-600 transition-colors"
            >
              Add Another
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold py-3 rounded-xl text-sm"
            >
              Done
            </button>
          </div>
        </div>
      )
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Smart Passport Upload">
      {renderContent()}
    </Modal>
  )
}

SmartPassportUpload.propTypes = {
  open:    PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}
