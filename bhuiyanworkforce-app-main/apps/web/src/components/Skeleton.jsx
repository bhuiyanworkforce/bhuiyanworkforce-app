import PropTypes from 'prop-types'
/**
 * Skeleton.jsx — content-shaped loading placeholders (Roadmap §1.4)
 *
 * All shimmer animation is driven by a single CSS keyframe injected once,
 * keeping the runtime cost minimal.  Each exported component matches the
 * exact dimensions of the real content it replaces so the page doesn't
 * shift when data arrives.
 *
 * Primitives
 *   <Bone>       — generic shimmer block; compose into any shape
 *
 * Page skeletons (drop-in replacements for spinner blocks)
 *   <DashboardSkeleton>   — stat cards + quick actions + financial summary
 *   <ListSkeleton>        — generic card-list rows (Candidates, Passports)
 *   <AccountsSkeleton>    — summary cards + invoice rows
 */

// ---------------------------------------------------------------------------
// Base primitive
// ---------------------------------------------------------------------------

/**
 * A single shimmering rectangle.
 * @param {string}  className   Tailwind size/shape/radius classes
 */
export function Bone({ className = '' }) {
  return (
    <div
      className={`skeleton-bone ${className}`}
      aria-hidden="true"
    />
  )
}


Bone.propTypes = {
  className: PropTypes.string,
}

// Inject the keyframe once into <head> — harmless if called multiple times.
if (typeof document !== 'undefined') {
  const ID = '__skeleton_style__'
  if (!document.getElementById(ID)) {
    const s = document.createElement('style')
    s.id = ID
    s.textContent = `
      @keyframes skeleton-shimmer {
        0%   { background-position: -200% 0; }
        100% { background-position:  200% 0; }
      }
      .skeleton-bone {
        background: linear-gradient(
          90deg,
          #0f1929 25%,
          #1a2540 50%,
          #0f1929 75%
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.6s ease-in-out infinite;
        border-radius: 0.5rem;
      }
    `
    document.head.appendChild(s)
  }
}

// ---------------------------------------------------------------------------
// Spinner — lightweight inline loading indicator
// Use for tab/section loading where a full skeleton is too heavy,
// e.g. CandidateDetail tab content, Reports profit tab, Payroll sub-lists.
// ---------------------------------------------------------------------------

/**
 * @param {string} color   Tailwind border-color class (default indigo)
 * @param {string} size    Tailwind size classes (default w-8 h-8)
 */
export function Spinner({ color = 'border-indigo-500', size = 'w-8 h-8' }) {
  return (
    <div className="flex justify-center py-12" aria-label="Loading" role="status">
      <div className={`${size} border-2 ${color} border-t-transparent rounded-full animate-spin`} />
    </div>
  )
}


Spinner.propTypes = {
  color: PropTypes.string,
  size: PropTypes.string,
}

// ---------------------------------------------------------------------------
// Dashboard skeleton
// ---------------------------------------------------------------------------

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading dashboard">
      {/* Page title */}
      <div>
        <Bone className="h-7 w-36 mb-2" />
        <Bone className="h-3.5 w-48" />
      </div>

      {/* Quick-action buttons  3-up */}
      <div className="grid grid-cols-3 gap-2">
        {[...new Array(3)].map((_, i) => (
          <Bone key={i} className="h-20 rounded-2xl" />
        ))}
      </div>

      {/* Stat cards  2×2 grid */}
      <div className="grid grid-cols-2 gap-3">
        {[...new Array(4)].map((_, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <Bone className="w-9 h-9 rounded-xl mb-3" />
            <Bone className="h-6 w-20 mb-1.5" />
            <Bone className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Financial summary card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <Bone className="h-4 w-32" />
        </div>
        {[...new Array(5)].map((_, i) => (
          <div key={i} className="flex justify-between items-center px-4 py-3 border-b border-slate-800 last:border-b-0">
            <Bone className="h-3.5 w-40" />
            <Bone className="h-3.5 w-20" />
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <Bone className="h-4 w-28" />
        </div>
        {[...new Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 last:border-b-0">
            <Bone className="w-8 h-8 rounded-xl flex-none" />
            <div className="flex-1">
              <Bone className="h-3.5 w-3/4 mb-1.5" />
              <Bone className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generic list skeleton (Candidates, Passports, etc.)
// ---------------------------------------------------------------------------

/**
 * @param {number}  rows      Number of placeholder rows (default 7)
 * @param {boolean} hasSearch Whether to show a search bar placeholder
 * @param {boolean} hasTabs   Whether to show filter tab placeholders
 */
export function ListSkeleton({ rows = 7, hasSearch = true, hasTabs = false }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Bone className="h-7 w-32 mb-2" />
          <Bone className="h-3.5 w-24" />
        </div>
        <Bone className="h-10 w-24 rounded-xl" />
      </div>

      {/* Search bar */}
      {hasSearch && <Bone className="h-11 w-full rounded-2xl" />}

      {/* Filter tabs */}
      {hasTabs && (
        <div className="flex gap-2">
          {[...new Array(4)].map((_, i) => (
            <Bone key={i} className="h-7 w-16 rounded-full flex-none" />
          ))}
        </div>
      )}

      {/* List rows */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {[...new Array(rows)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 last:border-b-0"
          >
            <Bone className="w-10 h-10 rounded-full flex-none" />
            <div className="flex-1">
              <Bone className="h-3.5 w-2/3 mb-2" />
              <Bone className="h-3 w-1/2" />
            </div>
            <Bone className="h-5 w-16 rounded-full flex-none" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Accounts / Invoices skeleton
// ---------------------------------------------------------------------------

export function AccountsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading invoices">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Bone className="h-7 w-28 mb-2" />
          <Bone className="h-3.5 w-20" />
        </div>
        <Bone className="h-10 w-28 rounded-xl" />
      </div>

      {/* Summary cards 2-up */}
      <div className="grid grid-cols-2 gap-3">
        {[...new Array(2)].map((_, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <Bone className="h-3.5 w-16 mb-2" />
            <Bone className="h-6 w-24 mb-1" />
            <Bone className="h-3 w-12" />
          </div>
        ))}
      </div>

      {/* Search + filter row */}
      <Bone className="h-11 w-full rounded-2xl" />
      <div className="flex gap-2">
        {[...new Array(4)].map((_, i) => (
          <Bone key={i} className="h-7 w-16 rounded-full flex-none" />
        ))}
      </div>

      {/* Invoice rows */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {[...new Array(6)].map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-4 border-b border-slate-800 last:border-b-0">
            <div className="flex-1">
              <Bone className="h-3.5 w-3/4 mb-2" />
              <Bone className="h-3 w-1/2 mb-1.5" />
              <Bone className="h-3 w-1/3" />
            </div>
            <div className="flex flex-col items-end gap-2 flex-none">
              <Bone className="h-4 w-20" />
              <Bone className="h-5 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


ListSkeleton.propTypes = {
  rows: PropTypes.number,
  hasSearch: PropTypes.bool,
  hasTabs: PropTypes.bool,
}

