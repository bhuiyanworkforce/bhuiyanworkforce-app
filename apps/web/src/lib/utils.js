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

// ─── Safe delete helper ────────────────────────────────────────────────────────
//
// Every hand-written delete in this app used to look like:
//   await supabase.from('table').delete().eq('id', id)
// with the result never checked. That has two silent failure modes:
//   1. RLS blocks it — Postgres/PostgREST does NOT return an error when a
//      delete matches zero rows because of RLS, it just reports success
//      with an empty result. An unchecked delete looks identical to a
//      real one.
//   2. A foreign-key constraint blocks it (this row is still referenced
//      by another table) — this DOES return an error, but if nobody
//      checks `error`, it's swallowed and the UI proceeds as if nothing
//      went wrong.
// Both were confirmed happening in production (a candidate that silently
// "deleted" while an RLS-restricted role was logged in, and separately a
// candidate blocked by an attached refund that surfaced as a raw
// Postgres error before this helper existed).
//
// `safeDelete` forces `.select()` so a silent RLS no-op becomes
// detectable (empty array instead of a lie), and turns any foreign-key
// violation (Postgres code 23503) into a plain-English message naming
// the table that's still pointing at this row — without needing every
// call site to know in advance which related tables might block it.
//
// Returns `{ ok: true }` on success, or `{ ok: false, message }` on any
// failure — callers should always check `.ok` before treating a delete
// as done.
export async function safeDelete(supabase, table, column, value) {
  try {
    const { data, error } = await supabase.from(table).delete().eq(column, value).select()

    if (error) {
      if (error.code === '23503') {
        const match = error.message.match(/on table "([^"]+)"/)
        const blockingTable = match ? match[1].replace(/_/g, ' ') : 'another record'
        return { ok: false, message: `Can't delete — this is still linked to ${blockingTable}. Remove or reassign that first.` }
      }
      return { ok: false, message: error.message }
    }
    if (!data || data.length === 0) {
      return { ok: false, message: "Delete didn't go through — your account may not have permission to do this. Ask an owner/manager." }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err.message || 'Something went wrong deleting this record.' }
  }
}
