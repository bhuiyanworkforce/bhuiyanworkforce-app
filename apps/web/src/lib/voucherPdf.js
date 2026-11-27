// ─── Payment / refund voucher PDF ───────────────────────────────────────────
// Every payout (salary, commission, cheque, refund, manual expense) can print a
// numbered voucher. Same layout engine as the invoice PDF, so it downloads as a
// real A4 file on phones.

import {
  INVOICE_COMPANY, esc, money, fmtDate, label,
  loadLogoDataUrl, bodyToPdfBlob, downloadPdfBlob,
} from './invoicePdf.js'

const NAVY = '#0B2A5B'
const GOLD = '#C9A24A'
const PAGE_W = 794
const PAGE_H = 1123

/**
 * @param {object} d
 *   kind      – 'payment' | 'refund'
 *   voucherNo – e.g. PV-26-00012
 *   date      – ISO date
 *   payee     – who received the money
 *   amount    – number
 *   method    – cash / bank / cheque ...
 *   reason    – what the money was for
 *   category  – expense category (optional)
 *   reference – cheque no / transaction ref (optional)
 *   paidBy    – name of the staff member who recorded it (optional)
 */
export function buildVoucherBody({ kind = 'payment', voucherNo, date, payee, amount, method, reason, category, reference, paidBy, logo }) {
  const C = INVOICE_COMPANY
  const title = kind === 'refund' ? 'REFUND VOUCHER' : 'PAYMENT VOUCHER'
  const contactBits = [C.address, C.phone, C.email, C.website].filter(Boolean).map(esc).join('  •  ')
  const rows = [
    ['Paid to', payee || '—'],
    ['Reason', reason || '—'],
    category ? ['Category', label(category)] : null,
    ['Method', label(method || 'cash')],
    reference ? ['Reference', reference] : null,
    ['Date', fmtDate(date)],
  ].filter(Boolean).map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join('')

  return `
<style>
  .inv, .inv * { box-sizing: border-box; margin: 0; padding: 0; }
  .inv { width: ${PAGE_W}px; min-height: ${PAGE_H}px; background: #fff; color: #1F2937; position: relative;
         font-family: 'Helvetica Neue', Arial, 'Noto Sans Bengali', 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.4;
         display: flex; flex-direction: column; overflow: hidden; }
  .inv .band { background: ${NAVY}; color: #fff; padding: 28px 44px; display: flex; align-items: center; justify-content: space-between; }
  .inv .brand { display: flex; align-items: center; gap: 16px; }
  .inv .logo { width: 62px; height: 62px; border-radius: 50%; background: #fff; border: 2px solid ${GOLD}; display: block; }
  .inv .co-name { font-size: 22px; font-weight: 800; }
  .inv .co-tag { font-size: 10.5px; letter-spacing: 2px; text-transform: uppercase; color: ${GOLD}; margin-top: 3px; font-weight: 700; }
  .inv .title { text-align: right; }
  .inv .title .big { font-size: 24px; font-weight: 800; letter-spacing: 4px; }
  .inv .title .no { font-size: 13px; color: ${GOLD}; font-weight: 700; margin-top: 2px; letter-spacing: 1px; }
  .inv .goldline { height: 4px; background: ${GOLD}; }
  .inv .body { padding: 28px 44px 20px; flex: 1; }
  .inv .contact { font-size: 10.5px; color: #6B7280; margin-bottom: 24px; }
  .inv .amount { border: 1px solid #E5E7EB; border-radius: 10px; padding: 18px 22px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
  .inv .amount .k { font-size: 10px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; color: #9CA3AF; }
  .inv .amount .v { font-size: 30px; font-weight: 800; color: ${NAVY}; }
  .inv table.det { width: 100%; border-collapse: collapse; }
  .inv table.det td { padding: 11px 4px; border-bottom: 1px solid #EEF0F3; font-size: 13.5px; vertical-align: top; }
  .inv table.det td.k { width: 130px; color: #6B7280; }
  .inv table.det td.v { font-weight: 700; }
  .inv .sign { display: flex; justify-content: space-between; gap: 60px; margin-top: 90px; }
  .inv .sign .box { flex: 1; text-align: center; }
  .inv .sign .line { border-top: 1.5px solid #9CA3AF; padding-top: 6px; font-size: 11px; color: #6B7280; letter-spacing: .6px; text-transform: uppercase; }
  .inv .sign .nm { font-weight: 800; color: ${NAVY}; font-size: 13px; text-transform: none; letter-spacing: 0; margin-bottom: 2px; }
  .inv .footer { margin-top: auto; background: #F3F4F6; border-top: 3px solid ${GOLD}; padding: 14px 44px; text-align: center; font-size: 11px; color: #6B7280; }
  .inv .footer b { color: ${NAVY}; }
</style>
<div class="inv">
  <div class="band">
    <div class="brand">
      ${logo ? `<img class="logo" src="${logo}" alt=""/>` : ''}
      <div><div class="co-name">${esc(C.name)}</div><div class="co-tag">${esc(C.tagline)}</div></div>
    </div>
    <div class="title"><div class="big">${title}</div><div class="no">${esc(voucherNo || '')}</div></div>
  </div>
  <div class="goldline"></div>
  <div class="body">
    ${contactBits ? `<div class="contact">${contactBits}</div>` : ''}
    <div class="amount"><div><div class="k">Amount paid</div></div><div class="v">${money(amount)}</div></div>
    <table class="det"><tbody>${rows}</tbody></table>
    <div class="sign">
      <div class="box"><div class="nm">${esc(paidBy || '')}</div><div class="line">Paid by</div></div>
      <div class="box"><div class="nm">&nbsp;</div><div class="line">Received by (signature)</div></div>
    </div>
  </div>
  <div class="footer"><b>${esc(C.name)}</b> &nbsp;•&nbsp; This voucher is proof of payment made.</div>
</div>`
}

export async function downloadVoucherPdf(data) {
  const logo = await loadLogoDataUrl()
  const blob = await bodyToPdfBlob(buildVoucherBody({ ...data, logo }))
  const name = `${String(data.voucherNo || 'voucher').replace(/[^\w.-]+/g, '_')}.pdf`
  downloadPdfBlob(blob, name)
}

/** Voucher data from an `expenses` row. */
export function voucherFromExpense(e, paidBy) {
  return {
    kind: 'payment',
    voucherNo: e.voucher_no,
    date: e.date,
    payee: e.payee_name || e.vendors?.name || '',
    amount: e.amount,
    method: e.payment_method,
    reason: e.description,
    category: e.category,
    reference: e.reference_no,
    paidBy,
  }
}

/** Voucher data from a `refunds` row (with candidates join). */
export function voucherFromRefund(r, paidBy) {
  return {
    kind: 'refund',
    voucherNo: r.voucher_no,
    date: r.paid_at || r.refund_date,
    payee: r.candidates?.full_name || '',
    amount: r.amount,
    method: r.payment_method,
    reason: r.reason,
    paidBy,
  }
}
