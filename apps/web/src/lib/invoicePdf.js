// ─── Invoice PDF generation ─────────────────────────────────────────────────────
//
// Why this exists: the old "PDF" button opened a blob: window and called
// window.print(). On phones that is unreliable — popups get blocked, the
// `load` listener is attached after the page may already have loaded, and many
// mobile browsers have no "Save as PDF" in the print dialog — so nothing ever
// downloaded.
//
// This builds a real A4 PDF file in the browser and downloads it directly:
//   HTML (browser lays it out, so ৳ and any language render correctly)
//     → SVG <foreignObject> → canvas → JPEG → tiny PDF writer.
// No third-party dependency, so package.json / lockfiles are untouched.
// If anything in that chain fails on a given browser, printInvoiceFallback()
// opens the classic print window instead.

import { formatBDT } from './utils.js'

// ── Edit these to change what appears on every invoice ─────────────────────────
export const INVOICE_COMPANY = {
  name:    'Bhuiyan Workforce Ltd.',
  tagline: 'International Manpower Recruitment',
  website: 'bhuiyanworkforce.com',
  // Add when you want them printed under the company name, e.g.
  // address: 'Dhaka, Bangladesh', phone: '+880 …', email: 'info@bhuiyanworkforce.com'
  address: '',
  phone:   '',
  email:   '',
}
const LOGO_URL = '/icon-192.png'

const NAVY = '#0B2A5B'
const GOLD = '#C9A24A'

const PAGE_W = 794    // A4 @ 96dpi, CSS px
const PAGE_H = 1123
const SCALE  = 2      // render at 2x for sharp text

// ── helpers ─────────────────────────────────────────────────────────────────────
function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function money(v) {
  const n = Number.parseFloat(v) || 0
  return formatBDT(n, Number.isInteger(n) ? 0 : 2)
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function label(s) {
  return String(s ?? '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const STATUS_STYLE = {
  paid:      { bg: '#D1FAE5', fg: '#065F46' },
  partial:   { bg: '#FEF3C7', fg: '#92400E' },
  unpaid:    { bg: '#FEE2E2', fg: '#991B1B' },
  cancelled: { bg: '#E5E7EB', fg: '#374151' },
}

async function loadLogoDataUrl() {
  try {
    const res = await fetch(LOGO_URL)
    if (!res.ok) return ''
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = reject
      r.readAsDataURL(blob)
    })
  } catch {
    return '' // the invoice still renders, just without the logo
  }
}

// ── HTML template ───────────────────────────────────────────────────────────────
/**
 * @param {object} d
 *   invoice  – invoices row (+ candidates.full_name)
 *   items    – invoice_items rows
 *   payments – payments rows (each may have `received_by_name`)
 *   issuer   – { full_name, role } of the person who created the invoice
 *   logo     – data: URL for the logo ('' for none)
 */
export function buildInvoiceBody({ invoice, items, payments = [], issuer, logo }) {
  const st = STATUS_STYLE[invoice.status] || STATUS_STYLE.unpaid
  const total = Number.parseFloat(invoice.total) || 0
  const paid = payments.reduce((s, p) => s + (Number.parseFloat(p.amount) || 0), 0)
  const balance = Math.max(0, total - paid)
  const issuerName = issuer?.full_name || ''
  const issuerRole = issuer?.role ? label(issuer.role) : ''
  const C = INVOICE_COMPANY
  const contactBits = [C.address, C.phone, C.email, C.website].filter(Boolean).map(esc).join('  •  ')

  const itemRows = items.map((it, i) => `
    <tr class="${i % 2 ? 'alt' : ''}">
      <td class="c-num">${i + 1}</td>
      <td class="c-desc">${esc(it.description)}</td>
      <td class="c-r">${esc(it.quantity)}</td>
      <td class="c-r">${money(it.unit_price)}</td>
      <td class="c-r strong">${money(it.total)}</td>
    </tr>`).join('')

  const payRows = payments.map(p => `
    <tr>
      <td>${fmtDate(p.created_at)}</td>
      <td>${esc(label(p.method))}</td>
      <td>${esc(p.receipt_no || '—')}</td>
      <td>${esc(p.received_by_name || '—')}</td>
      <td class="c-r strong">${money(p.amount)}</td>
    </tr>`).join('')

  const paymentsBlock = payments.length ? `
    <div class="section-title">Payments Received</div>
    <table class="pay">
      <thead><tr><th>Date</th><th>Method</th><th>Receipt No</th><th>Received By</th><th class="c-r">Amount</th></tr></thead>
      <tbody>${payRows}</tbody>
    </table>` : ''

  const notesBlock = invoice.notes ? `
    <div class="notes"><span class="k">Notes</span>${esc(invoice.notes)}</div>` : ''

  const cancelBlock = invoice.status === 'cancelled' ? `
    <div class="cancel-note"><b>Cancelled.</b> ${esc(invoice.cancel_reason || '')}</div>
    <div class="watermark">CANCELLED</div>` : ''

  return `
<style>
  .inv, .inv * { box-sizing: border-box; margin: 0; padding: 0; }
  .inv { width: ${PAGE_W}px; min-height: ${PAGE_H}px; background: #fff; color: #1F2937; position: relative;
         font-family: 'Helvetica Neue', Arial, 'Noto Sans Bengali', 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.4;
         display: flex; flex-direction: column; overflow: hidden; }
  .inv .band { background: ${NAVY}; color: #fff; padding: 28px 44px; display: flex; align-items: center; justify-content: space-between; }
  .inv .brand { display: flex; align-items: center; gap: 16px; }
  .inv .logo { width: 62px; height: 62px; border-radius: 50%; background: #fff; border: 2px solid ${GOLD}; display: block; }
  .inv .co-name { font-size: 22px; font-weight: 800; letter-spacing: .2px; }
  .inv .co-tag { font-size: 10.5px; letter-spacing: 2px; text-transform: uppercase; color: ${GOLD}; margin-top: 3px; font-weight: 700; }
  .inv .title { text-align: right; }
  .inv .title .big { font-size: 30px; font-weight: 800; letter-spacing: 6px; }
  .inv .title .no { font-size: 13px; color: ${GOLD}; font-weight: 700; margin-top: 2px; letter-spacing: 1px; }
  .inv .goldline { height: 4px; background: ${GOLD}; }
  .inv .body { padding: 28px 44px 20px; flex: 1; position: relative; }
  .inv .contact { font-size: 10.5px; color: #6B7280; margin-bottom: 20px; }
  .inv .top { display: flex; gap: 20px; margin-bottom: 26px; }
  .inv .card { flex: 1; border: 1px solid #E5E7EB; border-radius: 10px; padding: 14px 16px; }
  .inv .card .k { font-size: 10px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; color: #9CA3AF; margin-bottom: 6px; }
  .inv .card .v { font-size: 17px; font-weight: 800; color: ${NAVY}; }
  .inv .meta { width: 100%; font-size: 12.5px; }
  .inv .meta td { padding: 3px 0; }
  .inv .meta td:first-child { color: #6B7280; width: 90px; }
  .inv .meta td:last-child { font-weight: 700; text-align: right; }
  .inv .pill { display: inline-block; padding: 3px 11px; border-radius: 99px; font-size: 10.5px; font-weight: 800;
               letter-spacing: 1px; text-transform: uppercase; background: ${st.bg}; color: ${st.fg}; }
  .inv table { width: 100%; border-collapse: collapse; }
  .inv thead th { background: ${NAVY}; color: #fff; font-size: 10.5px; letter-spacing: 1.2px; text-transform: uppercase;
                  padding: 10px 12px; text-align: left; font-weight: 700; }
  .inv td { padding: 10px 12px; border-bottom: 1px solid #EEF0F3; font-size: 13px; vertical-align: top; }
  .inv tr.alt td { background: #F8FAFC; }
  .inv .c-num { width: 34px; color: #9CA3AF; }
  .inv .c-r { text-align: right; }
  .inv th.c-r { text-align: right; }
  .inv .strong { font-weight: 700; }
  .inv .totals { display: flex; justify-content: flex-end; margin-top: 16px; }
  .inv .totals table { width: 290px; }
  .inv .totals td { border: none; padding: 5px 12px; font-size: 13px; }
  .inv .totals td:last-child { text-align: right; font-weight: 700; }
  .inv .totals tr.paid td { color: #047857; }
  .inv .totals tr.bal td { background: ${NAVY}; color: #fff; font-size: 15px; font-weight: 800; padding: 10px 12px; }
  .inv .totals tr.bal td:last-child { color: ${GOLD}; }
  .inv .section-title { margin: 26px 0 8px; font-size: 10.5px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; color: ${NAVY};
                        border-bottom: 2px solid ${GOLD}; padding-bottom: 5px; display: inline-block; }
  .inv table.pay thead th { background: #EEF2F8; color: ${NAVY}; }
  .inv .notes { margin-top: 20px; padding: 12px 14px; background: #F8FAFC; border-left: 3px solid ${GOLD}; border-radius: 4px; font-size: 12px; color: #4B5563; }
  .inv .notes .k { display: block; font-size: 10px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; color: #9CA3AF; margin-bottom: 3px; }
  .inv .cancel-note { margin-top: 16px; padding: 10px 14px; background: #FEF2F2; color: #991B1B; border-radius: 8px; font-size: 12px; }
  .inv .sign { display: flex; justify-content: space-between; gap: 60px; margin-top: 46px; }
  .inv .sign .box { flex: 1; text-align: center; }
  .inv .sign .line { border-top: 1.5px solid #9CA3AF; padding-top: 6px; }
  .inv .sign .nm { font-weight: 800; color: ${NAVY}; font-size: 13px; }
  .inv .sign .rl { font-size: 10.5px; color: #6B7280; letter-spacing: .6px; text-transform: uppercase; margin-top: 1px; }
  .inv .sign .blank { height: 22px; }
  .inv .footer { margin-top: auto; background: #F3F4F6; border-top: 3px solid ${GOLD}; padding: 14px 44px; text-align: center; font-size: 11px; color: #6B7280; }
  .inv .footer b { color: ${NAVY}; }
  .inv .watermark { position: absolute; top: 470px; left: 50%; font-size: 92px; font-weight: 900; letter-spacing: 6px; color: rgba(220,38,38,.10);
                    transform: translate(-50%, -50%) rotate(-24deg); pointer-events: none; white-space: nowrap; }
</style>
<div class="inv">
  <div class="band">
    <div class="brand">
      ${logo ? `<img class="logo" src="${logo}" alt=""/>` : ''}
      <div><div class="co-name">${esc(C.name)}</div><div class="co-tag">${esc(C.tagline)}</div></div>
    </div>
    <div class="title"><div class="big">INVOICE</div><div class="no">${esc(invoice.invoice_no)}</div></div>
  </div>
  <div class="goldline"></div>

  <div class="body">
    ${contactBits ? `<div class="contact">${contactBits}</div>` : ''}
    <div class="top">
      <div class="card">
        <div class="k">Bill To</div>
        <div class="v">${esc(invoice.candidates?.full_name || 'N/A')}</div>
      </div>
      <div class="card">
        <table class="meta"><tbody>
          <tr><td>Issue date</td><td>${fmtDate(invoice.issued_at)}</td></tr>
          <tr><td>Due date</td><td>${fmtDate(invoice.due_date)}</td></tr>
          <tr><td>Status</td><td><span class="pill">${esc(invoice.status)}</span></td></tr>
          ${issuerName ? `<tr><td>Issued by</td><td>${esc(issuerName)}</td></tr>` : ''}
        </tbody></table>
      </div>
    </div>

    <table>
      <thead><tr><th class="c-num">#</th><th>Description</th><th class="c-r">Qty</th><th class="c-r">Unit Price</th><th class="c-r">Amount</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="totals"><table><tbody>
      <tr><td>Total</td><td>${money(total)}</td></tr>
      ${invoice.status === 'cancelled' ? '' : `<tr class="paid"><td>Paid</td><td>${money(paid)}</td></tr>
      <tr class="bal"><td>Balance Due</td><td>${money(balance)}</td></tr>`}
    </tbody></table></div>

    ${paymentsBlock}
    ${notesBlock}
    ${cancelBlock}

    <div class="sign">
      <div class="box"><div class="blank"></div><div class="line">
        <div class="nm">${esc(issuerName || ' ')}</div>
        <div class="rl">Issued by${issuerRole ? ` · ${esc(issuerRole)}` : ''}</div>
      </div></div>
      <div class="box"><div class="blank"></div><div class="line">
        <div class="nm">&#160;</div>
        <div class="rl">Authorized signature</div>
      </div></div>
    </div>
  </div>

  <div class="footer">Thank you for your business — <b>${esc(C.name)}</b>${C.website ? ` · ${esc(C.website)}` : ''}</div>
</div>`
}

// ── HTML → canvas pages ─────────────────────────────────────────────────────────
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not render invoice image'))
    img.src = src
  })
}

async function renderToCanvas(bodyHtml) {
  // 1. Lay the invoice out in the live page (off-screen) so we can measure it.
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;`
  host.innerHTML = bodyHtml
  document.body.appendChild(host)
  try {
    if (document.fonts?.ready) await document.fonts.ready
    await Promise.all([...host.querySelectorAll('img')].map(i => i.decode?.().catch(() => {})))

    const root = host.querySelector('.inv')
    const pages = Math.max(1, Math.ceil(root.scrollHeight / PAGE_H))
    root.style.minHeight = `${pages * PAGE_H}px`   // footer sits at the bottom of the last page
    const height = pages * PAGE_H

    // 2. Serialise as well-formed XHTML and wrap in an SVG <foreignObject>.
    // Serialise every top-level node (the <style> block AND the .inv root).
    const ser = new XMLSerializer()
    const xhtml = [...host.childNodes].map(n => ser.serializeToString(n)).join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${height}">
      <foreignObject x="0" y="0" width="${PAGE_W}" height="${height}">${xhtml}</foreignObject></svg>`
    const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg))

    // 3. Paint onto a canvas at 2x.
    const canvas = document.createElement('canvas')
    canvas.width = PAGE_W * SCALE
    canvas.height = height * SCALE
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { canvas, pages }
  } finally {
    host.remove()
  }
}

function canvasToJpeg(canvas, quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) return reject(new Error('Canvas export failed'))
      resolve(new Uint8Array(await blob.arrayBuffer()))
    }, 'image/jpeg', quality)
  })
}

// ── Minimal PDF writer (one full-page JPEG per page) ────────────────────────────
function buildPdf(jpegPages) {
  const enc = new TextEncoder()
  const chunks = []
  const offsets = []
  let length = 0
  const push = (data) => { const b = typeof data === 'string' ? enc.encode(data) : data; chunks.push(b); length += b.length }
  const startObj = (n) => { offsets[n] = length; push(`${n} 0 obj\n`) }

  const W = 595.28, H = 841.89 // A4 in points
  const pageObjNums = jpegPages.map((_, i) => 3 + i * 3)

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  startObj(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  startObj(2); push(`<< /Type /Pages /Kids [${pageObjNums.map(n => `${n} 0 R`).join(' ')}] /Count ${jpegPages.length} >>\nendobj\n`)

  jpegPages.forEach((jpg, i) => {
    const pageN = 3 + i * 3, contentN = pageN + 1, imageN = pageN + 2
    startObj(pageN)
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${imageN} 0 R >> >> /Contents ${contentN} 0 R >>\nendobj\n`)
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`
    startObj(contentN)
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`)
    startObj(imageN)
    push(`<< /Type /XObject /Subtype /Image /Width ${jpg.width} /Height ${jpg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.bytes.length} >>\nstream\n`)
    push(jpg.bytes)
    push('\nendstream\nendobj\n')
  })

  const total = 2 + jpegPages.length * 3
  const xrefAt = length
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`
  for (let n = 1; n <= total; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  push(xref)
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`)

  const out = new Uint8Array(length)
  let pos = 0
  for (const c of chunks) { out.set(c, pos); pos += c.length }
  return new Blob([out], { type: 'application/pdf' })
}

// ── Public API ──────────────────────────────────────────────────────────────────
/** Build the invoice PDF and return it as a Blob. */
export async function generateInvoicePdfBlob(data) {
  const logo = await loadLogoDataUrl()
  const { canvas, pages } = await renderToCanvas(buildInvoiceBody({ ...data, logo }))

  const jpegPages = []
  for (let p = 0; p < pages; p++) {
    const slice = document.createElement('canvas')
    slice.width = PAGE_W * SCALE
    slice.height = PAGE_H * SCALE
    const sctx = slice.getContext('2d')
    sctx.fillStyle = '#fff'
    sctx.fillRect(0, 0, slice.width, slice.height)
    sctx.drawImage(canvas, 0, p * PAGE_H * SCALE, slice.width, slice.height, 0, 0, slice.width, slice.height)
    jpegPages.push({ bytes: await canvasToJpeg(slice), width: slice.width, height: slice.height })
  }
  return buildPdf(jpegPages)
}

/** Build the PDF and trigger a file download named after the invoice. */
export async function downloadInvoicePdf(data) {
  const blob = await generateInvoicePdfBlob(data)
  const name = `${String(data.invoice.invoice_no || 'invoice').replace(/[^\w.-]+/g, '_')}.pdf`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  // Revoking immediately breaks the download on some mobile browsers.
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 10_000)
}

/** Last resort if PDF generation isn't supported: classic print window. */
export async function printInvoiceFallback(data) {
  const logo = await loadLogoDataUrl()
  const win = window.open('', '_blank')
  if (!win) throw new Error('Popup blocked — allow popups for this site and try again.')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${esc(data.invoice.invoice_no)}</title>
    <style>@page{size:A4;margin:0}body{margin:0}</style></head><body>${buildInvoiceBody({ ...data, logo })}</body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 400)
}
