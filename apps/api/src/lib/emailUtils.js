// ── Shared email utilities ─────────────────────────────────────────────────────
// Previously escHtml() was duplicated in both notifications.js and passports.js.
// Any fix to one would not propagate to the other. Centralised here so there is
// a single source of truth for both HTML escaping and email validation.

/**
 * Escape a value for safe inclusion in an HTML email body.
 * Prevents HTML injection when user-supplied strings are embedded in templates.
 */
export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Validate that a value looks like an email address before passing it to Resend.
 *
 * Uses a simple indexOf-based check rather than a regex to avoid super-linear
 * backtracking on pathological inputs (previously flagged by SonarCloud).
 * Resend performs its own full validation — this is just a first-pass guard.
 */
export function isValidEmail(value) {
  const s = String(value ?? '').trim()
  const at = s.indexOf('@')
  if (at < 1) return false                   // no @ or starts with @
  const domain = s.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  return dot > 0 && dot < domain.length - 1  // domain has a dot, not at start/end
}
