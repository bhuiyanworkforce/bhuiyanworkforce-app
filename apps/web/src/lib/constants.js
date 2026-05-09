// ─── Passport workflow stages ──────────────────────────────────────────────────
// Used in: Dashboard, Passports, AuditLog
export const PASSPORT_WORKFLOW_STAGES = [
  { key: 'received',         label: 'Received',        color: 'bg-blue-400' },
  { key: 'interview',        label: 'Interview',        color: 'bg-yellow-400' },
  { key: 'medical',          label: 'Medical',          color: 'bg-orange-400' },
  { key: 'police_clearance', label: 'Police Clearance', color: 'bg-purple-400' },
  { key: 'bmet',             label: 'BMET',             color: 'bg-cyan-400' },
  { key: 'calling_list',     label: 'Calling List',     color: 'bg-pink-400' },
  { key: 'visa_stamping',    label: 'Visa Stamping',    color: 'bg-indigo-400' },
  { key: 'mofa',             label: 'MOFA',             color: 'bg-violet-400' },
  { key: 'traveling',        label: 'Traveling',        color: 'bg-emerald-400' },
  { key: 'returned',         label: 'Returned',         color: 'bg-slate-400' },
  { key: 'cancelled',        label: 'Cancelled',        color: 'bg-red-400' },
]

// Badge color map for passport status (bg + text pair)
// Used in: Passports list, PassportDetail, AuditLog
export const PASSPORT_STATUS_COLOR = {
  received:         'bg-blue-500/15 text-blue-400',
  interview:        'bg-yellow-500/15 text-yellow-400',
  medical:          'bg-orange-500/15 text-orange-400',
  police_clearance: 'bg-purple-500/15 text-purple-400',
  bmet:             'bg-cyan-500/15 text-cyan-400',
  calling_list:     'bg-pink-500/15 text-pink-400',
  visa_stamping:    'bg-indigo-500/15 text-indigo-400',
  mofa:             'bg-violet-500/15 text-violet-400',
  traveling:        'bg-emerald-500/15 text-emerald-400',
  returned:         'bg-slate-500/15 text-slate-400',
  cancelled:        'bg-red-500/15 text-red-400',
}

export function passportStatusColor(status) {
  return PASSPORT_STATUS_COLOR[status] ?? 'bg-slate-700 text-slate-300'
}

export function passportStatusLabel(status) {
  return PASSPORT_WORKFLOW_STAGES.find(s => s.key === status)?.label ?? status ?? 'Unknown'
}

// ─── Candidate pipeline stages ─────────────────────────────────────────────────
// Used in: Candidates, CandidateDetail, Dashboard
export const CANDIDATE_PIPELINE_STAGES = [
  { key: 'new',           label: 'New',           color: 'bg-slate-500/15 text-slate-400'     },
  { key: 'screening',     label: 'Screening',     color: 'bg-blue-500/15 text-blue-400'       },
  { key: 'interview',     label: 'Interview',     color: 'bg-yellow-500/15 text-yellow-400'   },
  { key: 'medical',       label: 'Medical',       color: 'bg-orange-500/15 text-orange-400'   },
  { key: 'documents',     label: 'Documents',     color: 'bg-purple-500/15 text-purple-400'   },
  { key: 'visa_applied',  label: 'Visa Applied',  color: 'bg-indigo-500/15 text-indigo-400'   },
  { key: 'visa_approved', label: 'Visa Approved', color: 'bg-teal-500/15 text-teal-400'       },
  { key: 'traveling',     label: 'Traveling',     color: 'bg-emerald-500/15 text-emerald-400' },
  { key: 'placed',        label: 'Placed',        color: 'bg-green-500/15 text-green-400'     },
  { key: 'cancelled',     label: 'Cancelled',     color: 'bg-red-500/15 text-red-400'         },
]

export function stageColor(status) {
  return CANDIDATE_PIPELINE_STAGES.find(s => s.key === status)?.color ?? 'bg-slate-500/15 text-slate-400'
}

export function stageLabel(status) {
  return CANDIDATE_PIPELINE_STAGES.find(s => s.key === status)?.label ?? status ?? 'New'
}

// ─── Loan status colors ────────────────────────────────────────────────────────
export const LOAN_STATUS_COLOR = {
  active:  'bg-amber-500/15 text-amber-400',
  repaid:  'bg-emerald-500/15 text-emerald-400',
  partial: 'bg-blue-500/15 text-blue-400',
}

export function loanStatusColor(status) {
  return LOAN_STATUS_COLOR[status] ?? 'bg-slate-500/15 text-slate-400'
}

// ─── Expense categories ────────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES = ['salary', 'rent', 'embassy_fee', 'medical', 'travel', 'office', 'other']

export const EXPENSE_CAT_COLOR = {
  salary:      'bg-purple-500/15 text-purple-400',
  rent:        'bg-rose-500/15 text-rose-400',
  embassy_fee: 'bg-blue-500/15 text-blue-400',
  medical:     'bg-teal-500/15 text-teal-400',
  travel:      'bg-amber-500/15 text-amber-400',
  office:      'bg-indigo-500/15 text-indigo-400',
  other:       'bg-slate-500/15 text-slate-400',
}

// ─── Vendor categories ─────────────────────────────────────────────────────────
export const VENDOR_CATEGORIES = ['general', 'embassy', 'medical', 'travel', 'printing', 'bank', 'other']

// ─── Employee roles ────────────────────────────────────────────────────────────
export const EMPLOYEE_ROLES = ['manager', 'accountant', 'visa_officer', 'passport_officer', 'receptionist', 'driver', 'peon', 'other']
