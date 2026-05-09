// ─── Number helpers ────────────────────────────────────────────────────────────

/** Safely parse a value to float, returning 0 for null/undefined/NaN */
export function safeFloat(value) {
  return Number.parseFloat(value || 0) || 0
}

// ─── Payroll calculation helpers ───────────────────────────────────────────────
// Single source of truth — used by both the DB insert and the live preview
// so the two can never drift out of sync.

export function calcAgentNet({ base_amount, commission_amount, allowance, overtime, bonus, deductions }) {
  return (
    safeFloat(base_amount) +
    safeFloat(commission_amount) +
    safeFloat(allowance) +
    safeFloat(overtime) +
    safeFloat(bonus) -
    safeFloat(deductions)
  )
}

export function calcEmpNet({ basic_salary, bonus, deduction }) {
  return safeFloat(basic_salary) + safeFloat(bonus) - safeFloat(deduction)
}

// ─── Currency formatter ────────────────────────────────────────────────────────

/** Format a number as BDT — e.g. formatBDT(1234.5) → "৳1,235" */
export function formatBDT(value, decimals = 0) {
  return `৳${safeFloat(value).toLocaleString('en-BD', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

/** Today's date as a yyyy-mm-dd string (for date input default values) */
export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
