import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AppLayout from './layouts/AppLayout'

// ── Improvement D ─────────────────────────────────────────────────────────────
// All 16 page components were previously imported eagerly, meaning the entire
// app bundle was parsed on first load even if the user only visits /dashboard.
// React.lazy() splits each page into its own chunk — the browser only downloads
// and parses a page when the user first navigates to it.
//
// Suspense with a shared spinner handles the brief loading moment between
// navigation and the chunk arriving. AppLayout and Login are kept eager since
// they are always needed immediately on load.
// ─────────────────────────────────────────────────────────────────────────────
const Dashboard       = lazy(() => import('./pages/dashboard/Dashboard'))
const Passports       = lazy(() => import('./pages/passports/Passports'))
const VisaApplications= lazy(() => import('./pages/visa/VisaApplications'))
const Agents          = lazy(() => import('./pages/agents/Agents'))
const Accounts        = lazy(() => import('./pages/accounts/Accounts'))
const Candidates      = lazy(() => import('./pages/candidates/Candidates'))
const Profile         = lazy(() => import('./pages/profile/Profile'))
const Reports         = lazy(() => import('./pages/reports/Reports'))
const Expenses        = lazy(() => import('./pages/expenses/Expenses'))
const Vendors         = lazy(() => import('./pages/vendors/Vendors'))
const Loans           = lazy(() => import('./pages/loans/Loans'))
const Cheques         = lazy(() => import('./pages/cheques/Cheques'))
const Payroll         = lazy(() => import('./pages/payroll/Payroll'))
const Refunds         = lazy(() => import('./pages/refunds/Refunds'))
const AuditLog        = lazy(() => import('./pages/auditlog/AuditLog'))
const Employees       = lazy(() => import('./pages/employees/Employees'))
const Login           = lazy(() => import('./pages/auth/Login'))

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
          <Route path="/" element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }>
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
  )
}
