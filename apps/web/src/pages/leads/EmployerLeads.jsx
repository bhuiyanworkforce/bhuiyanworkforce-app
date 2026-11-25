import PropTypes from 'prop-types'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { safeDelete, todayISO } from '../../lib/utils'
import {
  Plus, Search, Target, X, ChevronRight, AlertTriangle, RefreshCw, Trash2,
  Mail, MessageCircle, ShieldCheck, ArrowRightCircle, Ban, CalendarClock, Upload, Reply, Phone, PhoneCall, Inbox,
} from 'lucide-react'
import { ListSkeleton } from '../../components/Skeleton'
import ImportLeadsModal from './ImportLeadsModal'

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://api.bhuiyanworkforce.com'

const STAGES = ['new', 'researching', 'vetted', 'contacted', 'replied', 'negotiating', 'won', 'lost']
const SOURCE_TYPES = ['registry', 'job_board', 'referral', 'event', 'website', 'other']
const VETTING = ['pending', 'passed', 'hold', 'refused']
const ADDRESS_TYPES = ['unknown', 'commercial', 'residential']

// WhatsApp opens only after the company has answered us by some other channel.
const WHATSAPP_STAGES = ['replied', 'negotiating', 'won']
const CONVERT_STAGES = ['replied', 'negotiating', 'won']

const STAGE_STYLE = {
  new:         { text: 'text-slate-400',   bg: 'bg-slate-500/15' },
  researching: { text: 'text-blue-400',    bg: 'bg-blue-500/15' },
  vetted:      { text: 'text-cyan-400',    bg: 'bg-cyan-500/15' },
  contacted:   { text: 'text-amber-400',   bg: 'bg-amber-500/15' },
  replied:     { text: 'text-violet-400',  bg: 'bg-violet-500/15' },
  negotiating: { text: 'text-orange-400',  bg: 'bg-orange-500/15' },
  won:         { text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  lost:        { text: 'text-red-400',     bg: 'bg-red-500/15' },
}

const VETTING_STYLE = {
  pending: 'bg-slate-500/15 text-slate-400',
  passed:  'bg-emerald-500/15 text-emerald-400',
  hold:    'bg-amber-500/15 text-amber-400',
  refused: 'bg-red-500/15 text-red-400',
}

const inputClass = 'bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500'

function label(s) { return String(s ?? '').replace(/_/g, ' ') }

function useEscape(onClose) {
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])
}

async function callLeadsApi(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Your session has expired. Please log in again.')
  const res = await fetch(`${API_BASE}/api/v1/leads${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body ?? {}),
  })
  let data = {}
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  return data
}

function whatsappUrl(phone, company) {
  let digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length < 8) return null
  const text = `Hello, this is Rezaul from Bhuiyan Workforce. Following up on our email about ${company}.`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

const GREEK_RE = /[Ͱ-Ͽἀ-῿]/

function addDaysISO(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function telHref(phone) {
  const raw = String(phone ?? '').trim()
  const digits = raw.replace(/\D/g, '')
  if (!digits) return undefined
  if (raw.startsWith('+')) return `tel:+${digits}`
  if (digits.startsWith('00')) return `tel:+${digits.slice(2)}`
  return `tel:${digits}`
}

// A short second email. It follows the language of the lead's saved draft.
function followUpDraft(lead) {
  const original = lead.draft_subject?.trim() || `Workers from Bangladesh for ${lead.company_name}?`
  const subject = `Re: ${original}`.replace(/^(Re:\s*)+/i, 'Re: ')
  if (GREEK_RE.test(lead.draft_body ?? '')) {
    return {
      subject,
      body:
`Αγαπητοί κύριοι,

Σας έγραψα πρόσφατα σχετικά με εργάτες από το Μπαγκλαντές για την εταιρεία σας. Γνωρίζω ότι τα εισερχόμενα γεμίζουν γρήγορα, γι' αυτό θέλω απλώς να βεβαιωθώ ότι το μήνυμά μου σας έφτασε.

Αν δεν είναι η κατάλληλη στιγμή, αρκεί μια σύντομη απάντηση και δεν θα σας ξαναγράψω.

Με εκτίμηση,
MD Rezaul Kabir Bhuiyan
Ιδρυτής, Bhuiyan Workforce Ltd.
partnerships@bhuiyanworkforce.com | +880 1864 567912 (Mobile & WhatsApp)
www.bhuiyanworkforce.com`,
    }
  }
  const who = lead.contact_name?.trim() || 'there'
  return {
    subject,
    body:
`Hello ${who},

I wrote recently about workers from Bangladesh for ${lead.company_name}. Inboxes fill up fast, so I wanted to check that my message reached you.

If now is not the right time, a short reply is enough and I will not write again.

Rezaul Kabir Bhuiyan
Bhuiyan Workforce Ltd.
bhuiyanworkforce.com`,
  }
}

function draftEmail(lead) {
  // Once an email has gone out, the next one is a follow-up, not the first email again.
  if (lead.first_contacted_at) return followUpDraft(lead)
  // A lead imported with its own written email opens with that text.
  if (lead.draft_subject?.trim() && lead.draft_body?.trim()) {
    return { subject: lead.draft_subject.trim(), body: lead.draft_body.trim() }
  }
  const who = lead.contact_name?.trim() || 'there'
  const place = lead.country?.trim() || 'your country'
  const subject = `Workers from Bangladesh for ${lead.company_name}?`
  const body =
`Hello ${who},

I run Bhuiyan Workforce, a recruitment agency in Dhaka. We prepare Bangladeshi workers for employers abroad, and I am speaking with companies in ${place} this month.

If ${lead.company_name} has roles that are hard to fill, I can send a short profile of the candidates we have in that trade. No obligation either way.

Who would be the right person to talk to about this?

Rezaul Kabir Bhuiyan
Bhuiyan Workforce Ltd.
bhuiyanworkforce.com`
  return { subject, body }
}

// ── Add lead ───────────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    company_name: '', country: '', industry: '', website: '',
    source_type: 'registry', source_url: '',
    contact_name: '', contact_role: '', contact_email: '', contact_phone: '',
    roles_needed: '', notes: '',
  }
}

function AddLeadModal({ onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  useEscape(onClose)

  async function handleSave() {
    if (!form.company_name.trim()) { setError('Company name is required'); return }
    if (!form.source_url.trim()) { setError('Add the link where you found this company'); return }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) {
      setError('Your session has expired. Please log in again.')
      setSaving(false)
      return
    }
    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]))
    const { error: err } = await supabase.from('employer_leads').insert({
      ...clean,
      company_name: form.company_name.trim(),
      source_type: form.source_type,
      created_by: user.id,
    })
    if (err) {
      setError(err.code === '23505' ? 'This company is already in your leads for that country' : err.message)
      setSaving(false)
      return
    }
    onSaved()
  }

  const field = (key, text, props = {}) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500 font-semibold">{text}</span>
      <input value={form[key]} onChange={e => set(key, e.target.value)} className={inputClass} {...props} />
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div role="dialog" aria-modal="true" aria-labelledby="add-lead-title" className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto mb-16">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 id="add-lead-title" className="text-slate-100 font-bold text-lg">Add Lead</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="p-5 pb-10 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
          {field('company_name', 'Company name *', { placeholder: 'Company name' })}
          <div className="grid grid-cols-2 gap-3">
            {field('country', 'Country')}
            {field('industry', 'Industry', { placeholder: 'e.g. Construction' })}
          </div>
          {field('website', 'Website', { placeholder: 'https://' })}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Found through</span>
              <select value={form.source_type} onChange={e => set('source_type', e.target.value)} className={inputClass}>
                {SOURCE_TYPES.map(s => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </label>
            {field('source_url', 'Source link *', { placeholder: 'Registry or listing URL' })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('contact_name', 'Contact name')}
            {field('contact_role', 'Contact role', { placeholder: 'e.g. HR manager' })}
          </div>
          {field('contact_email', 'Contact email', { type: 'email', placeholder: 'Business address from their own site' })}
          {field('contact_phone', 'Contact phone', { placeholder: 'With country code' })}
          {field('roles_needed', 'Roles they hire for')}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Notes</span>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className={`${inputClass} resize-none`} />
          </label>
          <button type="button" onClick={handleSave} disabled={saving || !form.company_name.trim()}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 rounded-xl font-bold text-sm mt-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Lead'}
          </button>
        </div>
      </div>
    </div>
  )
}

AddLeadModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

// ── Email composer ─────────────────────────────────────────────────────────────
function EmailModal({ lead, onClose, onSent }) {
  const initial = draftEmail(lead)
  const [subject, setSubject] = useState(initial.subject)
  const [body, setBody] = useState(initial.body)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  useEscape(onClose)

  async function handleSend() {
    setSending(true)
    setError('')
    try {
      await callLeadsApi(`/${lead.id}/send-email`, { subject, body })
      onSent()
    } catch (err) {
      setError(err.message)
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end justify-center">
      <div role="dialog" aria-modal="true" aria-labelledby="lead-email-title" className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mb-16">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 id="lead-email-title" className="text-slate-100 font-bold text-lg">Email {lead.company_name}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="p-5 pb-10 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
          <p className="text-slate-500 text-xs">From partnerships@bhuiyanworkforce.com to {lead.contact_email}. {lead.first_contacted_at ? 'This is a short follow-up. ' : lead.draft_body ? 'This is the email saved with the lead. ' : ''}Read it once more before you send. An opt-out line is added automatically.</p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Subject</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={150} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Message</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} maxLength={5000} className={`${inputClass} resize-none`} />
          </label>
          <button type="button" onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50">
            {sending ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </div>
    </div>
  )
}

EmailModal.propTypes = {
  lead: PropTypes.shape({
    id: PropTypes.string.isRequired,
    company_name: PropTypes.string.isRequired,
    contact_email: PropTypes.string,
    contact_name: PropTypes.string,
    country: PropTypes.string,
    draft_subject: PropTypes.string,
    draft_body: PropTypes.string,
    first_contacted_at: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSent: PropTypes.func.isRequired,
}

// ── Lead detail ────────────────────────────────────────────────────────────────
function LeadDetail({ lead, onClose, onChanged }) {
  const [activities, setActivities] = useState([])
  const [note, setNote] = useState('')
  const [showEmail, setShowEmail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEscape(onClose)

  const loadActivities = useCallback(async () => {
    const { data } = await supabase
      .from('employer_lead_activities')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
    setActivities(data ?? [])
  }, [lead.id])

  useEffect(() => { loadActivities() }, [loadActivities])

  async function logActivity(kind, summary) {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('employer_lead_activities').insert({
      lead_id: lead.id, kind, summary, created_by: session?.user?.id ?? null,
    })
    loadActivities()
  }

  async function update(patch, activity) {
    setError('')
    const { data, error: err } = await supabase
      .from('employer_leads').update(patch).eq('id', lead.id).select().maybeSingle()
    if (err || !data) { setError(err?.message ?? 'Update was not saved'); return }
    onChanged(data)
    if (activity) logActivity(activity.kind, activity.summary)
  }

  async function addNote() {
    const text = note.trim()
    if (!text) return
    await logActivity('note', text)
    setNote('')
  }

  async function handleConvert() {
    setBusy(true)
    setError('')
    try {
      await callLeadsApi(`/${lead.id}/convert`)
      setMessage('Converted. The company is now in Employers.')
      const { data } = await supabase.from('employer_leads').select('*').eq('id', lead.id).maybeSingle()
      if (data) onChanged(data)
      loadActivities()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function logCall() {
    await update(
      {
        last_contacted_at: new Date().toISOString(),
        next_follow_up: addDaysISO(7),
        ...(['new', 'researching', 'vetted'].includes(lead.stage) ? { stage: 'contacted' } : {}),
      },
      { kind: 'call', summary: 'Called' }
    )
  }

  function openWhatsApp() {
    const url = whatsappUrl(lead.contact_phone, lead.company_name)
    if (!url) { setError('Phone number needs a country code, for example +48 123 456 789'); return }
    logActivity('whatsapp_opened', 'Opened WhatsApp chat')
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const stageStyle = STAGE_STYLE[lead.stage] ?? STAGE_STYLE.new
  const dueNow = lead.next_follow_up && lead.next_follow_up <= todayISO() && !['won', 'lost'].includes(lead.stage)
  const vettingOk = lead.vetting_status === 'passed' && lead.registry_checked && lead.address_type === 'commercial'
  const canEmail = !lead.do_not_contact && vettingOk && !!lead.contact_email
  const canWhatsApp = !lead.do_not_contact && WHATSAPP_STAGES.includes(lead.stage) && !!lead.contact_phone
  const canConvert = !lead.converted_employer_id && lead.vetting_status === 'passed' && CONVERT_STAGES.includes(lead.stage)

  let emailHint = ''
  if (lead.do_not_contact) emailHint = 'Marked do not contact.'
  else if (!vettingOk) emailHint = 'To unlock email: tick the registry box, set the address to commercial, and mark vetting passed.'
  else if (!lead.contact_email) emailHint = 'Add a contact email to send.'

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto" role="dialog" aria-modal="true" aria-label={`Lead: ${lead.company_name}`}>
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200"><X size={22} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-sm truncate">{lead.company_name}</p>
          <p className="text-slate-500 text-xs">{[lead.country, lead.industry].filter(Boolean).join(' · ') || 'No details set'}</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${stageStyle.bg} ${stageStyle.text}`}>{lead.stage}</span>
      </div>

      <div className="p-4 pb-24 flex flex-col gap-4">
        {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
        {message && <p className="text-emerald-400 text-sm bg-emerald-500/10 px-4 py-2 rounded-xl">{message}</p>}
        {lead.do_not_contact && (
          <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 px-4 py-2 rounded-xl flex items-center gap-2">
            <Ban size={16} /> Do not contact. Email and WhatsApp are off for this company.
          </p>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          {[
            { k: 'Contact', v: [lead.contact_name, lead.contact_role].filter(Boolean).join(', ') || '—' },
            { k: 'Email', v: lead.contact_email || '—' },
            { k: 'Phone', v: lead.contact_phone || '—' },
            { k: 'Roles', v: lead.roles_needed || '—' },
            { k: 'Found through', v: label(lead.source_type) },
          ].map(f => (
            <div key={f.k} className="min-w-0">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{f.k}</p>
              <p className="text-slate-200 text-sm font-semibold break-words">{f.v}</p>
            </div>
          ))}
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Source</p>
            {lead.source_url
              ? <a href={lead.source_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 text-sm font-semibold break-all">Open link</a>
              : <p className="text-slate-200 text-sm font-semibold">—</p>}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-slate-400" />
            <p className="text-slate-200 text-sm font-bold">Vetting</p>
            <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full capitalize ${VETTING_STYLE[lead.vetting_status]}`}>{lead.vetting_status}</span>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={lead.registry_checked}
              onChange={e => update({ registry_checked: e.target.checked })} />
            Found in the official company registry
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Address type</span>
              <select value={lead.address_type} onChange={e => update({ address_type: e.target.value })} className={inputClass}>
                {ADDRESS_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Verdict</span>
              <select value={lead.vetting_status}
                onChange={e => update({ vetting_status: e.target.value }, { kind: 'vetting', summary: `Vetting set to ${e.target.value}` })}
                className={inputClass}>
                {VETTING.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Vetting notes</span>
            <textarea defaultValue={lead.vetting_notes ?? ''} rows={2}
              onBlur={e => { if (e.target.value !== (lead.vetting_notes ?? '')) update({ vetting_notes: e.target.value || null }) }}
              placeholder="Registry number, red flags, who confirmed what" className={`${inputClass} resize-none`} />
          </label>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Stage</span>
              <select value={lead.stage}
                onChange={e => update({ stage: e.target.value }, { kind: 'stage_change', summary: `Stage set to ${e.target.value}` })}
                className={inputClass}>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Follow up on</span>
              <input type="date" value={lead.next_follow_up ?? ''}
                onChange={e => update({ next_follow_up: e.target.value || null })} className={inputClass} />
            </label>
          </div>
          {lead.stage === 'contacted' && (
            <button type="button"
              onClick={() => update({ stage: 'replied' }, { kind: 'reply', summary: 'Marked as replied' })}
              className="flex items-center justify-center gap-2 bg-violet-600/20 text-violet-300 border border-violet-500/40 py-2 rounded-xl text-sm font-bold">
              <Reply size={16} /> They replied
            </button>
          )}
          {dueNow && <p className="text-amber-400 text-xs flex items-center gap-1"><CalendarClock size={14} /> Follow-up is due</p>}

          <div className="flex flex-col gap-2">
            <button type="button" disabled={!canEmail} onClick={() => setShowEmail(true)}
              className="flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-40">
              <Mail size={16} /> {lead.first_contacted_at ? 'Write follow-up' : 'Write email'}
            </button>
            {emailHint && <p className="text-slate-500 text-xs">{emailHint}</p>}

            <button type="button" disabled={!canWhatsApp} onClick={openWhatsApp}
              className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-40">
              <MessageCircle size={16} /> Open WhatsApp chat
            </button>
            {!canWhatsApp && !lead.do_not_contact && (
              <p className="text-slate-500 text-xs">WhatsApp unlocks after the company replies and a phone number is saved.</p>
            )}

            {lead.contact_phone && !lead.do_not_contact && (
              <div className="flex gap-2">
                <a href={telHref(lead.contact_phone)}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-800 text-slate-200 py-2.5 rounded-xl text-sm font-bold">
                  <Phone size={16} /> Call
                </a>
                <button type="button" onClick={logCall}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-800 text-slate-200 py-2.5 rounded-xl text-sm font-bold">
                  <PhoneCall size={16} /> Log call
                </button>
              </div>
            )}

            <button type="button" disabled={!canConvert || busy} onClick={handleConvert}
              className="flex items-center justify-center gap-2 bg-slate-800 text-slate-200 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40">
              <ArrowRightCircle size={16} /> {lead.converted_employer_id ? 'Already in Employers' : 'Convert to employer'}
            </button>
            {!canConvert && !lead.converted_employer_id && (
              <p className="text-slate-500 text-xs">Needs vetting passed and a reply from the company.</p>
            )}
          </div>

          <button type="button"
            onClick={() => update(
              { do_not_contact: !lead.do_not_contact },
              { kind: 'note', summary: lead.do_not_contact ? 'Removed do-not-contact flag' : 'Marked do not contact' }
            )}
            className="text-xs text-red-400 text-left">
            {lead.do_not_contact ? 'Remove do-not-contact flag' : 'Mark as do not contact'}
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-slate-200 text-sm font-bold">Activity</p>
          <div className="flex gap-2">
            <label htmlFor="lead-note" className="sr-only">Add a note</label>
            <input id="lead-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Replied, called, asked for profiles…"
              className={`${inputClass} flex-1`} />
            <button type="button" onClick={addNote} disabled={!note.trim()} className="bg-slate-800 text-slate-200 px-4 rounded-xl text-sm font-bold disabled:opacity-40">Add</button>
          </div>
          {activities.length === 0 ? (
            <p className="text-slate-600 text-sm">Nothing logged yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {activities.map(a => (
                <li key={a.id} className="border-l-2 border-slate-700 pl-3">
                  <p className="text-slate-300 text-sm break-words">{a.summary}</p>
                  <p className="text-slate-600 text-[11px]">{label(a.kind)} · {new Date(a.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showEmail && (
        <EmailModal lead={lead} onClose={() => setShowEmail(false)}
          onSent={async () => {
            setShowEmail(false)
            setMessage('Email sent.')
            const { data } = await supabase.from('employer_leads').select('*').eq('id', lead.id).maybeSingle()
            if (data) onChanged(data)
            loadActivities()
          }} />
      )}
    </div>
  )
}

LeadDetail.propTypes = {
  lead: PropTypes.shape({
    id: PropTypes.string.isRequired,
    company_name: PropTypes.string.isRequired,
    country: PropTypes.string,
    industry: PropTypes.string,
    contact_name: PropTypes.string,
    contact_role: PropTypes.string,
    contact_email: PropTypes.string,
    contact_phone: PropTypes.string,
    roles_needed: PropTypes.string,
    source_type: PropTypes.string,
    source_url: PropTypes.string,
    stage: PropTypes.string,
    next_follow_up: PropTypes.string,
    registry_checked: PropTypes.bool,
    address_type: PropTypes.string,
    vetting_status: PropTypes.string,
    vetting_notes: PropTypes.string,
    do_not_contact: PropTypes.bool,
    converted_employer_id: PropTypes.string,
    first_contacted_at: PropTypes.string,
    draft_subject: PropTypes.string,
    draft_body: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onChanged: PropTypes.func.isRequired,
}

// ── List page ──────────────────────────────────────────────────────────────────
export default function EmployerLeads() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [checking, setChecking] = useState(false)
  const [inboxMsg, setInboxMsg] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const fetchLeads = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase.from('employer_leads').select('*').order('created_at', { ascending: false })
      if (err) throw err
      setLeads(data || [])
    } catch {
      setError('Failed to load leads. Tap refresh to try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  async function handleCheckInbox() {
    setChecking(true)
    setInboxMsg('')
    try {
      const r = await callLeadsApi('/check-replies')
      const parts = [`${r.newReplies} new repl${r.newReplies === 1 ? 'y' : 'ies'}`]
      if (r.autoReplies > 0) parts.push(`${r.autoReplies} automatic`)
      if (r.optOuts > 0) parts.push(`${r.optOuts} marked do not contact, please check`)
      setInboxMsg(`Inbox checked: ${parts.join(', ')}.`)
      fetchLeads()
    } catch (err) {
      setInboxMsg(err.message)
    } finally {
      setChecking(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await fetchLeads()
    setRefreshing(false)
  }

  async function handleDelete(id) {
    const result = await safeDelete(supabase, 'employer_leads', 'id', id)
    setConfirmDelete(null)
    if (!result.ok) { alert(result.message); return }
    fetchLeads()
  }

  function handleChanged(updated) {
    setLeads(prev => prev.map(l => (l.id === updated.id ? updated : l)))
  }

  const today = todayISO()
  const q = search.toLowerCase()
  const isCallList = l => !l.contact_email && !!l.contact_phone && !l.do_not_contact && !['won', 'lost'].includes(l.stage)
  const callCount = leads.filter(isCallList).length
  const filtered = leads.filter(l =>
    (stageFilter === 'all' || (stageFilter === 'call_list' ? isCallList(l) : l.stage === stageFilter)) &&
    (l.company_name?.toLowerCase().includes(q) || l.country?.toLowerCase().includes(q))
  )
  const dueCount = leads.filter(l => l.next_follow_up && l.next_follow_up <= today && !['won', 'lost'].includes(l.stage)).length
  const selected = leads.find(l => l.id === selectedId) ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Employer Leads</h1>
          <p className="text-slate-500 text-sm">
            {leads.length} total{dueCount > 0 ? ` · ${dueCount} follow-up${dueCount > 1 ? 's' : ''} due` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleRefresh} disabled={refreshing} aria-label="Refresh" className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={handleCheckInbox} disabled={checking} aria-label="Check inbox for replies" className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
            <Inbox size={16} className={checking ? 'animate-pulse' : ''} />
          </button>
          <button type="button" onClick={() => setShowImport(true)} aria-label="Import leads" className="p-2 rounded-xl bg-slate-800 text-slate-400">
            <Upload size={16} />
          </button>
          <button type="button" onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {inboxMsg && <p className="text-slate-300 text-sm bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl">{inboxMsg}</p>}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <label htmlFor="lead-search" className="sr-only">Search leads</label>
        <input id="lead-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by company or country..."
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all', 'call_list', ...STAGES].map(s => (
          <button key={s} type="button" onClick={() => setStageFilter(s)}
            className={`flex-none text-xs font-bold px-3 py-1.5 rounded-full capitalize border ${stageFilter === s ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/50' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>
            {s === 'call_list' ? `Call list (${callCount})` : s}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertTriangle size={28} className="text-red-400" />
          <p className="text-red-400 text-sm text-center">{error}</p>
          <button type="button" onClick={handleRefresh} className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm">Retry</button>
        </div>
      ) : loading ? (
        <ListSkeleton rows={4} hasSearch={false} hasTabs={false} />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-600">
              <Target size={32} className="mb-3" />
              <p className="text-sm">{search || stageFilter !== 'all' ? 'No leads match' : 'No leads yet'}</p>
            </div>
          ) : (
            <ul>
              {filtered.map((l, i) => {
                const style = STAGE_STYLE[l.stage] ?? STAGE_STYLE.new
                const due = l.next_follow_up && l.next_follow_up <= today && !['won', 'lost'].includes(l.stage)
                return (
                  <li key={l.id} className={`flex items-center gap-3 px-4 py-4 ${i < filtered.length - 1 ? 'border-b border-slate-800' : ''}`}>
                    <button type="button" className="flex items-center gap-3 flex-1 min-w-0 text-left active:bg-slate-800" onClick={() => setSelectedId(l.id)}>
                      <div className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center flex-none`}>
                        <Target size={18} className={style.text} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-sm font-semibold truncate">{l.company_name}</p>
                        <p className="text-slate-500 text-xs truncate">
                          {[l.country, l.industry].filter(Boolean).join(' · ') || 'No details set'}
                          {due ? ' · follow-up due' : ''}
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full capitalize flex-none ${style.bg} ${style.text}`}>{l.stage}</span>
                      <ChevronRight size={16} className="text-slate-600 flex-none" />
                    </button>
                    {confirmDelete === l.id ? (
                      <div className="flex flex-col items-end gap-1 flex-none">
                        <button type="button" onClick={() => handleDelete(l.id)} className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold">Delete</button>
                        <button type="button" onClick={() => setConfirmDelete(null)} className="text-xs text-slate-600 px-2 py-0.5">Cancel</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelete(l.id)} aria-label={`Delete ${l.company_name}`} className="text-slate-600 hover:text-red-400 transition-colors p-1 flex-none">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchLeads() }} />}
      {showImport && <ImportLeadsModal onClose={() => setShowImport(false)} onImported={() => fetchLeads()} />}
      {selected && <LeadDetail lead={selected} onClose={() => setSelectedId(null)} onChanged={handleChanged} />}
    </div>
  )
}
