import PropTypes from 'prop-types'
import { useRef, useState } from 'react'
import { Camera, Upload, X, Loader } from 'lucide-react'

// Moved to outer scope (L40 – SonarCloud: move parseMRZ to outer scope)
function parseMRZ(text) {
  // MRZ lines are 44 chars each, uppercase letters and digits and <
  const lines = text.split('\n')
    .map(l => l.replaceAll(/[^A-Z0-9<]/g, '').trim())
    .filter(l => l.length >= 30)

  // Find two consecutive MRZ-like lines
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
    // Try single long line fallback
    const long = lines.find(l => l.length >= 40)
    if (!long) return null
    line2 = long.padEnd(44, '<').slice(0, 44)
  }

  // L98 – SonarCloud: handle or don't catch the exception
  // Returning null on parse failure is intentional; re-throw unexpected errors
  const passportNo = line2.slice(0, 9).replaceAll('<', '')
  const dobRaw = line2.slice(13, 19)   // YYMMDD
  const expiryRaw = line2.slice(21, 27) // YYMMDD
  const nationality = line2.slice(10, 13).replaceAll('<', '')

  // Parse name from line1 positions 5-43
  let fullName = ''
  if (line1.length >= 43) {
    const namePart = line1.slice(5, 44)
    const parts = namePart.split('<<')
    const surname = parts[0]?.replaceAll('<', ' ').trim() ?? ''
    const given = parts[1]?.replaceAll('<', ' ').trim() ?? ''
    fullName = given ? `${given} ${surname}` : surname
  }

  function mrzDate(dateRaw) {
    if (!dateRaw || dateRaw.length < 6) return ''
    const yy = Number.parseInt(dateRaw.slice(0, 2), 10)
    const mm = dateRaw.slice(2, 4)
    const dd = dateRaw.slice(4, 6)
    const year = yy > 30 ? 1900 + yy : 2000 + yy
    return `${year}-${mm}-${dd}`
  }

  if (!passportNo || passportNo.length < 5) return null

  return {
    passport_no: passportNo,
    full_name: fullName || null,
    date_of_birth: mrzDate(dobRaw),
    expiry_date: mrzDate(expiryRaw),
    nationality: nationality || null,
  }
}

export default function OCRScanner({ onResult, onClose }) {
  const fileRef = useRef(null)
  const [scanning, setScanning] = useState(false)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  async function processImage(file) {
    setScanning(true)
    setError('')

    const url = URL.createObjectURL(file)
    setPreview(url)

    try {
      const Tesseract = (await import('tesseract.js')).default
      const { data: { text } } = await Tesseract.recognize(file, 'eng', {
        logger: () => {},
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
      })

      const result = parseMRZ(text)
      if (result) {
        onResult(result)
      } else {
        setError('Could not read passport data. Try a clearer photo of the bottom two lines.')
      }
    } catch (err) {
      setError(`Scan failed: ${err.message}`)
    } finally {
      setScanning(false)
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (file) processImage(file)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-end justify-center">
      <div className="bg-slate-900 border border-slate-800 rounded-t-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-base font-bold text-slate-100">Scan Passport</h2>
          <button onClick={onClose}><X size={20} className="text-slate-500"/></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {preview && (
            <img src={preview} alt="passport" className="w-full rounded-xl object-cover max-h-48"/>
          )}

          {scanning && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader size={28} className="text-indigo-400 animate-spin"/>
              <p className="text-slate-400 text-sm">Reading passport data...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {!scanning && (
            <>
              <p className="text-slate-500 text-xs text-center">
                Take a clear photo of the <span className="text-slate-300 font-semibold">bottom two lines</span> of the passport (MRZ zone)
              </p>

              <input ref={fileRef} type="file" accept="image/*" capture="environment"
                onChange={handleFile} className="hidden"/>

              <button onClick={() => fileRef.current.click()}
                className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold py-3 rounded-xl">
                <Camera size={18}/> Take Photo
              </button>

              <button onClick={() => { fileRef.current.removeAttribute('capture'); fileRef.current.click() }}
                className="flex items-center justify-center gap-2 w-full bg-slate-800 border border-slate-700 text-slate-300 font-bold py-3 rounded-xl">
                <Upload size={18}/> Upload from Gallery
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// L4 – SonarCloud: 'onResult' and 'onClose' missing in props validation
OCRScanner.propTypes = {
  onResult: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}
