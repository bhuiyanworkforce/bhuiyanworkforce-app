import PropTypes from 'prop-types'
import { useState } from 'react'
import { FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { downloadVoucherPdf, voucherFromExpense, voucherFromRefund } from '../lib/voucherPdf'

/**
 * Downloads a numbered voucher PDF.
 *   <VoucherButton expense={row} />                       an expenses row you already have
 *   <VoucherButton sourceType="employee_payroll" sourceId={id} />   looks up the expense a payment created
 *   <VoucherButton refund={row} />                        a paid refund
 */
export default function VoucherButton({ expense, sourceType, sourceId, refund, className = '', compact = false }) {
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)

  async function handleClick(e) {
    e.stopPropagation()
    setBusy(true)
    try {
      const paidBy = profile?.full_name || ''
      if (refund) {
        if (!refund.voucher_no) throw new Error('This refund has no voucher yet. Mark it as paid first.')
        await downloadVoucherPdf(voucherFromRefund(refund, paidBy))
      } else {
        let row = expense
        if (!row) {
          const { data, error } = await supabase.from('expenses').select('*, vendors(name)')
            .eq('source_type', sourceType).eq('source_id', sourceId).maybeSingle()
          if (error) throw error
          row = data
        }
        if (!row) throw new Error('No voucher found for this payment yet.')
        await downloadVoucherPdf(voucherFromExpense(row, paidBy))
      }
    } catch (err) {
      alert(err.message || 'Could not create the voucher')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={busy}
      className={className || (compact
        ? 'flex items-center gap-1 text-[11px] font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1.5 rounded-lg disabled:opacity-50'
        : 'w-full flex items-center justify-center gap-2 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-bold py-3 rounded-2xl disabled:opacity-50')}>
      <FileText size={compact ? 12 : 16} />
      {busy ? 'Preparing…' : 'Voucher'}
    </button>
  )
}

VoucherButton.propTypes = {
  expense: PropTypes.object,
  sourceType: PropTypes.string,
  sourceId: PropTypes.string,
  refund: PropTypes.object,
  className: PropTypes.string,
  compact: PropTypes.bool,
}
