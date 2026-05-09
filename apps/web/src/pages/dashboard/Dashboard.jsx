import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import {
  Stamp, FileText, Users, Wallet,
  AlertTriangle, TrendingUp, Plus,
  ChevronRight, Clock
} from 'lucide-react'

const WORKFLOW_STAGES = [
  { key: 'received',        label: 'Received',        color: 'bg-blue-400' },
  { key: 'interview',       label: 'Interview',        color: 'bg-yellow-400' },
  { key: 'medical',         label: 'Medical',          color: 'bg-orange-400' },
  { key: 'police_clearance',label: 'Police Clearance', color: 'bg-purple-400' },
  { key: 'bmet',            label: 'BMET',             color: 'bg-cyan-400' },
  { key: 'calling_list',    label: 'Calling List',     color: 'bg-pink-400' },
  { key: 'visa_stamping',   label: 'Visa Stamping',    color: 'bg-indigo-400' },
  { key: 'mofa',            label: 'MOFA',             color: 'bg-violet-400' },
  { key: 'traveling',       label: 'Traveling',        color: 'bg-emerald-400' },
  { key: 'returned',        label: 'Returned',         color: 'bg-slate-400' },
]

function safeFloat(value) {
  return Number.parseFloat(value || 0)
}

// FIX: Helper to safely unwrap a Promise.allSettled result.
// Returns the value on fulfillment, or the fallback on rejection.
// This lets one failing query degrade gracefully instead of taking
// down the entire dashboard (previously Promise.all would throw on
// the first failure and show a full-page error).
function settled(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({
    totalPassports: 0, activeVisa: 0,
    totalCandidates: 0, totalAgents: 0,
    totalRevenue: 0, outstanding: 0,
    overdueCount: 0, overdueAmount: 0,
    chequesReceivable: 0, chequesPayable: 0,
    thisMonthExpenses: 0,
  })
  const [workflowCounts, setWorkflowCounts] = useState([])
  const [expiringPassports, setExpiringPassports] = useState([])
  const [recentActivity, setRecentActivity] = useState([])

  useEffect(() => {
    // FIX: On hard refresh, user starts null while auth initializes.
    // If user is null we still must clear loading — otherwise the spinner
    // hangs if the effect already ran before user was set.
    if (user) fetchAll()
    else setLoading(false)
  }, [user])

  async function fetchAll() {
    setError(null)
    try {
      const nowMs = Date.now()
      const now = new Date(nowMs)
      const in90days = new Date(nowMs)
      in90days.setDate(in90days.getDate() + 90)

      // FIX: Switched from Promise.all to Promise.allSettled so that one
      // failing query (e.g. cheques, expenses) shows the rest of the
      // dashboard with partial data instead of a full-page error.
      const results = await Promise.allSettled([
        supabase.from('passports').select('*', { count: 'exact', head: true }),
        supabase.from('visa_applications').select('*', { count: 'exact', head: true })
          .not('status', 'in', '("approved","rejected","cancelled")'),
        supabase.from('candidates').select('*', { count: 'exact', head: true }),
        supabase.from('agents').select('*', { count: 'exact', head: true }),
        supabase.from('passports').select('status'),
        supabase.from('passports')
          .select('passport_no, expiry_date, candidates(full_name)')
          .lte('expiry_date', in90days.toISOString().split('T')[0])
          .gte('expiry_date', now.toISOString().split('T')[0])
          .order('expiry_date', { ascending: true }).limit(5),
        supabase.from('invoices').select('total, status, due_date'),
        supabase.from('passport_workflow_logs')
          .select('to_status, changed_at, passports(passport_no, candidates(full_name)), profiles(full_name)')
          .order('changed_at', { ascending: false }).limit(6),
        supabase.from('cheques').select('amount, type, status'),
        supabase.from('expenses').select('amount').gte('date',
          new Date(new Date(nowMs).getFullYear(), new Date(nowMs).getMonth(), 1).toISOString().split('T')[0]),
      ])

      const [
        r0, r1, r2, r3, r4, r5, r6, r7, r8, r9,
      ] = results

      const totalPassports  = settled(r0, { count: 0 }).count
      const activeVisa      = settled(r1, { count: 0 }).count
      const totalCandidates = settled(r2, { count: 0 }).count
      const totalAgents     = settled(r3, { count: 0 }).count
      const passportData    = settled(r4, { data: [] }).data
      const expiring        = settled(r5, { data: [] }).data
      const invoiceData     = settled(r6, { data: [] }).data
      const recentLogs      = settled(r7, { data: [] }).data
      const chequesData     = settled(r8, { data: [] }).data
      const monthExpenses   = settled(r9, { data: [] }).data

      const counts = {}
      passportData?.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1 })
      setWorkflowCounts(
        WORKFLOW_STAGES.map(s => ({ ...s, count: counts[s.key] || 0 })).filter(s => s.count > 0)
      )

      const paid = invoiceData?.filter(i => i.status === 'paid').reduce((s, i) => s + safeFloat(i.total), 0) || 0
      const unpaid = invoiceData?.filter(i => i.status === 'unpaid').reduce((s, i) => s + safeFloat(i.total), 0) || 0
      const overdueInvs = invoiceData?.filter(i => i.due_date && i.status !== 'paid' && i.status !== 'cancelled' && new Date(i.due_date) < new Date(nowMs)) || []
      const chequesReceivable = (chequesData || []).filter(c => c.type === 'receivable' && c.status === 'pending').reduce((s, c) => s + safeFloat(c.amount), 0)
      const chequesPayable = (chequesData || []).filter(c => c.type === 'payable' && c.status === 'pending').reduce((s, c) => s + safeFloat(c.amount), 0)
      const thisMonthExpenses = (monthExpenses || []).reduce((s, e) => s + safeFloat(e.amount), 0)

      setStats({
        totalPassports: totalPassports || 0,
        activeVisa: activeVisa || 0,
        totalCandidates: totalCandidates || 0,
        totalAgents: totalAgents || 0,
        totalRevenue: paid,
        outstanding: unpaid,
        overdueCount: overdueInvs.length,
        overdueAmount: overdueInvs.reduce((s, i) => s + safeFloat(i.total), 0),
        chequesReceivable,
        chequesPayable,
        thisMonthExpenses,
      })
      setExpiringPassports(expiring || [])

      const in30days = new Date(nowMs)
      in30days.setDate(in30days.getDate() + 30)
      const soonExpiring = (expiring || []).filter(p => new Date(p.expiry_date) <= in30days)
      soonExpiring.forEach(p => {
        supabase.functions.invoke('send-notification', {
          body: { type: 'passport_expiring', data: { candidate_name: p.candidates?.full_name || 'Unknown', passport_no: p.passport_no, expiry_date: p.expiry_date } }
        })
      })
      setRecentActivity(recentLogs || [])
    } catch (err) {
      console.error('Dashboard load error:', err)
      setError('Failed to load dashboard data. Pull down to retry.')
    } finally {
      setLoading(false)
    }
  }

  const maxCount = Math.max(...workflowCounts.map(s => s.count), 1)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 px-4">
      <AlertTriangle size={32} className="text-red-400"/>
      <p className="text-slate-400 text-sm text-center">{error}</p>
      <button onClick={fetchAll} className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
        Retry
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-100">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Add Candidate', icon: Users,  path: '/candidates', color: 'from-emerald-500 to-teal-600' },
          { label: 'Add Passport',  icon: Stamp,  path: '/passports',  color: 'from-indigo-500 to-violet-600' },
          { label: 'New Invoice',   icon: Wallet, path: '/accounts',   color: 'from-pink-500 to-rose-600' },
        ].map(({ label, icon: Icon, path, color }) => (
          <button key={label} onClick={() => navigate(path)}
            className={`flex flex-col items-center gap-2 bg-gradient-to-br ${color} rounded-2xl p-3 shadow-lg`}>
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center"><Icon size={16} className="text-white"/></div>
            <span className="text-white text-[10px] font-bold text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Passports',   value: stats.totalPassports,                      icon: Stamp,      color: 'from-indigo-500 to-violet-600' },
          { label: 'Active Visa', value: stats.activeVisa,                           icon: FileText,   color: 'from-amber-500 to-orange-600'  },
          { label: 'Revenue',     value: '৳' + stats.totalRevenue.toLocaleString(),  icon: TrendingUp, color: 'from-emerald-500 to-teal-600'  },
          { label: 'Outstanding', value: '৳' + stats.outstanding.toLocaleString(),   icon: Wallet,     color: 'from-red-500 to-rose-600'      },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-3`}><Icon size={16} className="text-white"/></div>
            <p className="text-xl font-extrabold text-slate-100">{value}</p>
            <p className="text-slate-500 text-xs font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800"><h3 className="text-sm font-bold text-slate-300">Financial Summary</h3></div>
        <div className="divide-y divide-slate-800">
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-slate-400 text-sm">Revenue (paid invoices)</span>
            <span className="text-emerald-400 font-bold text-sm">+৳{stats.totalRevenue.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-slate-400 text-sm">Expenses this month</span>
            <span className="text-rose-400 font-bold text-sm">-৳{stats.thisMonthExpenses.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-slate-400 text-sm">Cheques receivable</span>
            <span className="text-blue-400 font-bold text-sm">+৳{stats.chequesReceivable.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-slate-400 text-sm">Cheques payable</span>
            <span className="text-orange-400 font-bold text-sm">-৳{stats.chequesPayable.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3 bg-slate-800/50">
            <span className="text-slate-200 text-sm font-bold">Net Position</span>
            <span className={`font-extrabold text-sm ${(stats.totalRevenue - stats.thisMonthExpenses + stats.chequesReceivable - stats.chequesPayable) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              ৳{(stats.totalRevenue - stats.thisMonthExpenses + stats.chequesReceivable - stats.chequesPayable).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {stats.overdueCount > 0 && (
        <button onClick={() => navigate('/accounts')}
          className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 flex items-center gap-3 w-full text-left">
          <AlertTriangle size={18} className="text-red-400 flex-none"/>
          <div className="flex-1">
            <p className="text-red-400 text-sm font-bold">{stats.overdueCount} overdue invoice{stats.overdueCount > 1 ? 's' : ''}</p>
            <p className="text-slate-500 text-xs">৳{stats.overdueAmount.toLocaleString()} past due date</p>
          </div>
          <ChevronRight size={16} className="text-red-400 flex-none"/>
        </button>
      )}

      {expiringPassports.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-500/20">
            <AlertTriangle size={16} className="text-amber-400 flex-none"/>
            <h3 className="text-sm font-bold text-amber-400">{expiringPassports.length} Passport{expiringPassports.length > 1 ? 's' : ''} Expiring Within 90 Days</h3>
          </div>
          <ul>
            {expiringPassports.map((p, i) => {
              const daysLeft = Math.ceil((new Date(p.expiry_date) - Date.now()) / (1000 * 60 * 60 * 24))
              return (
                <li key={p.passport_no}
                  className={`flex items-center justify-between px-4 py-3 ${i < expiringPassports.length - 1 ? 'border-b border-amber-500/10' : ''}`}>
                  <div>
                    <p className="text-slate-200 text-sm font-semibold">{p.candidates?.full_name}</p>
                    <p className="text-slate-500 text-xs font-mono">{p.passport_no}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${daysLeft <= 30 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {daysLeft}d left
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {workflowCounts.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-300">Passport Pipeline</h3>
            <button onClick={() => navigate('/passports')} className="text-indigo-400 text-xs font-semibold">View All →</button>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {workflowCounts.map(stage => (
              <button
                key={stage.key}
                onClick={() => navigate('/passports', { state: { filterStatus: stage.key } })}
                className="w-full text-left active:opacity-70 transition-opacity"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-slate-300 text-xs font-medium">{stage.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs font-bold">{stage.count}</span>
                    <ChevronRight size={12} className="text-slate-600"/>
                  </div>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${stage.color} rounded-full transition-all duration-700`}
                    style={{ width: `${(stage.count / maxCount) * 100}%` }}/>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {recentActivity.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800"><h3 className="text-sm font-bold text-slate-300">Recent Activity</h3></div>
          <ul>
            {recentActivity.map((log, i) => (
              <li key={log.id || i} className={`flex items-start gap-3 px-4 py-3 ${i < recentActivity.length - 1 ? 'border-b border-slate-800' : ''}`}>
                <div className="w-7 h-7 rounded-full bg-indigo-500/15 flex items-center justify-center flex-none mt-0.5">
                  <Clock size={13} className="text-indigo-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-xs font-semibold truncate">{log.passports?.candidates?.full_name}</p>
                  <p className="text-slate-500 text-xs capitalize">Moved to <span className="text-indigo-400 font-semibold">{log.to_status?.replaceAll('_', ' ')}</span></p>
                  <p className="text-slate-600 text-[10px] mt-0.5">by {log.profiles?.full_name} · {new Date(log.changed_at).toLocaleDateString()}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.totalPassports === 0 && stats.totalCandidates === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 flex items-center justify-center mb-4"><Plus size={28} className="text-indigo-400"/></div>
          <h3 className="text-slate-200 font-bold mb-2">Welcome to Bhuiyan Workforce</h3>
          <p className="text-slate-500 text-sm mb-5">Start by adding your first candidate and passport</p>
          <button onClick={() => navigate('/candidates')} className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold px-6 py-3 rounded-xl text-sm">
            Add First Candidate
          </button>
        </div>
      )}
    </div>
  )
}
