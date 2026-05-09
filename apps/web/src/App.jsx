import { lazy, Suspense, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout from './layouts/AppLayout'

// ── Error Boundary ─────────────────────────────────────────────────────────────
// Placed OUTSIDE Suspense so it also catches failed lazy chunk loads (404s).
// When a new deployment happens, the service worker may serve a stale
// index.html that references old hashed JS chunks — those chunks return 404,
// which makes the lazy() import reject. Without an ErrorBoundary outside
// Suspense, that rejection is silent and the spinner never resolves.
// With this boundary outside, the user gets a "Try again" button that
// reloads the page and gets the fresh chunks.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught:', error, info?.componentStack)
  }

  handleReset = () => this.setState({ hasError: false })

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050D1A] flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-100 mb-2">Something went wrong</h2>
            <p className="text-slate-400 text-sm mb-6">
              This may be caused by a stale cache. Reloading usually fixes it.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                Reload page
              </button>
              <button
                onClick={this.handleReset}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Lazy pages with chunk-error retry ─────────────────────────────────────────
// If a hashed chunk returns 404 (stale SW cache after redeployment), we reload
// the page once automatically so the user gets fresh chunks silently.
function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn()
      .then(module => {
        // Chunk loaded successfully — clear the reload flag so that a future
        // stale-chunk error on a different route can still trigger a reload.
        // Without this, the flag from one bad chunk permanently disables
        // auto-retry for the rest of the session.
        sessionStorage.removeItem('chunk_reload')
        return module
      })
      .catch(() => {
        // Chunk failed to load — force a full page reload to bust the SW cache.
        // Add a flag so we don't reload-loop if the chunk is genuinely broken.
        if (!sessionStorage.getItem('chunk_reload')) {
          sessionStorage.setItem('chunk_reload', '1')
          window.location.reload()
        }
        // Return a dummy module so React doesn't crash before the reload fires
        return { default: () => null }
      })
  )
}

const Dashboard        = lazyWithRetry(() => import('./pages/dashboard/Dashboard'))
const Passports        = lazyWithRetry(() => import('./pages/passports/Passports'))
const VisaApplications = lazyWithRetry(() => import('./pages/visa/VisaApplications'))
const Agents           = lazyWithRetry(() => import('./pages/agents/Agents'))
const Accounts         = lazyWithRetry(() => import('./pages/accounts/Accounts'))
const Candidates       = lazyWithRetry(() => import('./pages/candidates/Candidates'))
const Profile          = lazyWithRetry(() => import('./pages/profile/Profile'))
const Reports          = lazyWithRetry(() => import('./pages/reports/Reports'))
const Expenses         = lazyWithRetry(() => import('./pages/expenses/Expenses'))
const Vendors          = lazyWithRetry(() => import('./pages/vendors/Vendors'))
const Loans            = lazyWithRetry(() => import('./pages/loans/Loans'))
const Cheques          = lazyWithRetry(() => import('./pages/cheques/Cheques'))
const Payroll          = lazyWithRetry(() => import('./pages/payroll/Payroll'))
const Refunds          = lazyWithRetry(() => import('./pages/refunds/Refunds'))
const AuditLog         = lazyWithRetry(() => import('./pages/auditlog/AuditLog'))
const Employees        = lazyWithRetry(() => import('./pages/employees/Employees'))
const Login            = lazyWithRetry(() => import('./pages/auth/Login'))

function PageSpinner() {
  return (
    <div className="min-h-screen bg-[#050D1A] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <PageSpinner />
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    // ErrorBoundary wraps everything — catches chunk load failures too
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageSpinner />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"  element={<Dashboard />} />
              <Route path="passports"  element={<Passports />} />
              <Route path="visa"       element={<VisaApplications />} />
              <Route path="candidates" element={<Candidates />} />
              <Route path="agents"     element={<Agents />} />
              <Route path="accounts"   element={<Accounts />} />
              <Route path="reports"    element={<Reports />} />
              <Route path="profile"    element={<Profile />} />
              <Route path="expenses"   element={<Expenses />} />
              <Route path="vendors"    element={<Vendors />} />
              <Route path="loans"      element={<Loans />} />
              <Route path="cheques"    element={<Cheques />} />
              <Route path="payroll"    element={<Payroll />} />
              <Route path="refunds"    element={<Refunds />} />
              <Route path="audit-log"  element={<AuditLog />} />
              <Route path="employees"  element={<Employees />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
