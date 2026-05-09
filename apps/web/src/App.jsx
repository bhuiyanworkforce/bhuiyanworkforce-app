import { lazy, Suspense, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AppLayout from './layouts/AppLayout'

// ── Error Boundary ─────────────────────────────────────────────────────────────
// FIX: Previously there were no error boundaries in the app. Any uncaught render
// error in any page component (bad data shape, null access, a failed lazy chunk)
// would propagate all the way up and crash the entire app to a blank screen.
//
// ErrorBoundary is a class component because React's error boundary API
// (getDerivedStateFromError + componentDidCatch) is not available in hooks.
// It wraps every lazy-loaded route so a broken page is isolated — the header,
// nav, and other pages keep working.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Page crashed:', error, info?.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
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
              This page ran into an unexpected error. Your other data is fine.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Lazy-loaded pages ──────────────────────────────────────────────────────────
// All 16 page components are split into their own chunks — the browser only
// downloads and parses a page when the user first navigates to it.
const Dashboard        = lazy(() => import('./pages/dashboard/Dashboard'))
const Passports        = lazy(() => import('./pages/passports/Passports'))
const VisaApplications = lazy(() => import('./pages/visa/VisaApplications'))
const Agents           = lazy(() => import('./pages/agents/Agents'))
const Accounts         = lazy(() => import('./pages/accounts/Accounts'))
const Candidates       = lazy(() => import('./pages/candidates/Candidates'))
const Profile          = lazy(() => import('./pages/profile/Profile'))
const Reports          = lazy(() => import('./pages/reports/Reports'))
const Expenses         = lazy(() => import('./pages/expenses/Expenses'))
const Vendors          = lazy(() => import('./pages/vendors/Vendors'))
const Loans            = lazy(() => import('./pages/loans/Loans'))
const Cheques          = lazy(() => import('./pages/cheques/Cheques'))
const Payroll          = lazy(() => import('./pages/payroll/Payroll'))
const Refunds          = lazy(() => import('./pages/refunds/Refunds'))
const AuditLog         = lazy(() => import('./pages/auditlog/AuditLog'))
const Employees        = lazy(() => import('./pages/employees/Employees'))
const Login            = lazy(() => import('./pages/auth/Login'))

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
            {/* Each route is wrapped in its own ErrorBoundary so a crash on
                one page never takes down the layout or other pages. */}
            <Route path="dashboard"  element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="passports"  element={<ErrorBoundary><Passports /></ErrorBoundary>} />
            <Route path="visa"       element={<ErrorBoundary><VisaApplications /></ErrorBoundary>} />
            <Route path="candidates" element={<ErrorBoundary><Candidates /></ErrorBoundary>} />
            <Route path="agents"     element={<ErrorBoundary><Agents /></ErrorBoundary>} />
            <Route path="accounts"   element={<ErrorBoundary><Accounts /></ErrorBoundary>} />
            <Route path="reports"    element={<ErrorBoundary><Reports /></ErrorBoundary>} />
            <Route path="profile"    element={<ErrorBoundary><Profile /></ErrorBoundary>} />
            <Route path="expenses"   element={<ErrorBoundary><Expenses /></ErrorBoundary>} />
            <Route path="vendors"    element={<ErrorBoundary><Vendors /></ErrorBoundary>} />
            <Route path="loans"      element={<ErrorBoundary><Loans /></ErrorBoundary>} />
            <Route path="cheques"    element={<ErrorBoundary><Cheques /></ErrorBoundary>} />
            <Route path="payroll"    element={<ErrorBoundary><Payroll /></ErrorBoundary>} />
            <Route path="refunds"    element={<ErrorBoundary><Refunds /></ErrorBoundary>} />
            <Route path="audit-log"  element={<ErrorBoundary><AuditLog /></ErrorBoundary>} />
            <Route path="employees"  element={<ErrorBoundary><Employees /></ErrorBoundary>} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
