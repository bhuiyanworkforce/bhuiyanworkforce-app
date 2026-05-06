import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AppLayout from './layouts/AppLayout'
import Login from './pages/auth/Login'
import Dashboard from './pages/dashboard/Dashboard'
import Passports from './pages/passports/Passports'
import VisaApplications from './pages/visa/VisaApplications'
import Agents from './pages/agents/Agents'
import Accounts from './pages/accounts/Accounts'
import Candidates from './pages/candidates/Candidates'
import Profile from './pages/profile/Profile'
import Reports from './pages/reports/Reports'
import Expenses from './pages/expenses/Expenses'
import Vendors from './pages/vendors/Vendors'
import Loans from './pages/loans/Loans'
import Cheques from './pages/cheques/Cheques'
import Payroll from './pages/payroll/Payroll'
import Refunds from './pages/refunds/Refunds'
import AuditLog from './pages/auditlog/AuditLog'
import Employees from './pages/employees/Employees'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-[#050D1A] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}
