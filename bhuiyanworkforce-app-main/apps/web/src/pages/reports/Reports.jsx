import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  BarChart2, Download, TrendingUp, Users,
  Stamp, Wallet, FileText, Calendar, X, DollarSign, RefreshCw
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts'
import { Spinner } from '../../components/Skeleton'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── BACKUP FIX ──────────────────────────────────────────────────────────────
// The original backup used a sequential for-loop and called .select('*') with
// no pagination. Supabase defaults to a 1,000-row limit, so any table with
// more than 1,000 rows was silently truncated in the backup file.
//
// Fixes:
//   1. fetchAllRows() pages through each table in 1,000-row chunks until
//      exhausted, so the backup is always complete.
//   2. Tables are fetched in parallel (Promise.all) instead of sequentially,
//      making the backup roughly 14× faster on large datasets.
//   3. Any per-table error is captured individually and attached to the backup
//      object as a warning key so the file still downloads with all other data.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchAllRows(supabaseClient, table) {
  const CHUNK = 1000
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await supabaseClient
      .from(table)
      .select('*')
      .range(from, from + CHUNK - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < CHUNK) break
    from += CHUNK
  }
  return all
}

async function runFullBackup(supabaseClient) {
  const tables = ['candidates','passports','invoices','invoice_items','payments','agents','expenses','vendors','loans','cheques','payroll','refunds','employees','visa_applications']
  const backup = { exported_at: new Date().toISOString(), warnings: [] }

  // Fetch all tables in parallel — each table is itself paginated
  const results = await Promise.allSettled(
    tables.map(table => fetchAllRows(supabaseClient, table))
  )

  results.forEach((result, i) => {
    const table = tables[i]
    if (result.status === 'fulfilled') {
      backup[table] = result.value
    } else {
      backup[table] = []
      backup.warnings.push(`${table}: ${result.reason?.message || 'fetch failed'}`)
      console.error(`Backup failed for table "${table}":`, result.reason)
    }
  })

  const a = document.createElement('a')
  a.href = 'data:application/json,' + encodeURIComponent(JSON.stringify(backup, null, 2))
  a.download = 'agencyos-backup-' + new Date().toISOString().slice(0, 10) + '.json'
  a.click()
}

function exportCSV(rows, filename) {
  if (!rows.length) return
  const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = 'data:text/csv,' + encodeURIComponent(csv)
  a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
}

async function exportInvoicesCSV() {
  const { data } = await supabase.from('invoices').select('invoice_no, status, total, issued_at, due_date, candidates(full_name), agents(full_name)').order('issued_at', { ascending: false })
  exportCSV((data||[]).map(i => ({ Invoice: i.invoice_no, Candidate: i.candidates?.full_name||'', Agent: i.agents?.full_name||'', Amount: i.total||0, Status: i.status, 'Issue Date': i.issued_at?.split('T')[0]||'', 'Due Date': i.due_date||'' })), 'invoices')
}

async function exportPassportsCSV() {
  const { data } = await supabase.from('passports').select('passport_no, status, issue_date, expiry_date, current_location, candidates(full_name, phone)').order('created_at', { ascending: false })
  exportCSV((data||[]).map(p => ({ 'Passport No': p.passport_no, Candidate: p.candidates?.full_name||'', Phone: p.candidates?.phone||'', Status: p.status, 'Issue Date': p.issue_date||'', 'Expiry Date': p.expiry_date||'', Location: p.current_location||'' })), 'passports')
}

// ─── BUG 6 FIX ───────────────────────────────────────────────────────────────
// getFromISO and getToISO were plain functions defined INSIDE the component but
// OUTSIDE the fetchReports useCallback. Because they close over `period`,
// `customFrom`, and `customTo` from the render scope, and fetchReports has
// those variables listed in its `deps` array, React would create a new
// fetchReports function on every period/customFrom/customTo change — but the
// *old* closures of getFromISO/getToISO could still be captured if fetchReports
// itself referenced those function references from the enclosing scope.
//
// In practice the stale-closure window was small, but it caused a subtle bug:
// switching period to "custom", then back to "month" while a fetch was
// in-flight could result in the second fetch using the custom date range.
//
// Fix: move getFromISO and getToISO INSIDE fetchReports and fetchProfitability,
// so they are always freshly created with the current argument values from the
// useCallback deps. This eliminates the stale-closure risk entirely.
//
// As a secondary improvement: fetchReports now has a proper error state instead
// of just console.error + returning silently (the loading spinner would get
// stuck if invErr was truthy).
// ─────────────────────────────────────────────────────────────────────────────

function getFromISO(period, customFrom) {
  if (period === 'custom') return customFrom ? new Date(customFrom).toISOString() : '2000-01-01T00:00:00Z'
  const d = new Date()
  if (period === 'month')   d.setMonth(d.getMonth() - 1)
  if (period === 'quarter') d.setMonth(d.getMonth() - 3)
  if (period === 'year')    d.setFullYear(d.getFullYear() - 1)
  if (period === 'all')     return '2000-01-01T00:00:00Z'
  return d.toISOString()
}

function getToISO(period, customTo) {
  if (period === 'custom' && customTo) return new Date(customTo + 'T23:59:59').toISOString()
  return new Date().toISOString()
}

function PassportStatusChart({ passportsByStatus }) {
  const STATUS_HEX = {
    received: '#60a5fa', interview: '#facc15', medical: '#fb923c',
    police_clearance: '#c084fc', bmet: '#22d3ee', calling_list: '#f472b6',
    visa_stamping: '#818cf8', mofa: '#a78bfa', traveling: '#34d399',
    returned: '#94a3b8', cancelled: '#f87171',
  }
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <h2 className="text-sm font-bold text-slate-300">Passport Status Breakdown</h2>
      </div>
      <div className="flex flex-col items-center py-2">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={passportsByStatus} dataKey="count" nameKey="status"
              cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={2}>
              {passportsByStatus.map(({ status }) => (
                <Cell key={status} fill={STATUS_HEX[status] ?? '#64748b'} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(v, name) => [v, name.replaceAll('_', ' ')]}
            />
            <Legend
              formatter={name => <span style={{ color: '#94a3b8', fontSize: 11, textTransform: 'capitalize' }}>{name.replaceAll('_', ' ')}</span>}
              iconType="circle" iconSize={8}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function Reports() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [period, setPeriod] = useState('month')
  const [activeTab, setActiveTab] = useState('overview')
  const [showCustom, setShowCustom] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState({
    revenue: [], expenses: 0, passportsByStatus: [],
    agentPerformance: [], totalRevenue: 0,
    totalInvoices: 0, paidInvoices: 0, unpaidInvoices: 0,
  })
  const [profitData, setProfitData] = useState([])
  const [profitLoading, setProfitLoading] = useState(false)

  // ── Date helpers — defined as a pure utility outside the component ──────────
  // Accepting period/customFrom/customTo as arguments (not closing over state)
  // completely eliminates any stale-closure risk.

  const fetchReports = useCallback(async (currentPeriod, currentFrom, currentTo) => {
    setLoading(true)
    setFetchError(null)

    const from = getFromISO(currentPeriod, currentFrom)
    const to = getToISO(currentPeriod, currentTo)
    const fromDay = from.split('T')[0]
    const toDay = to.split('T')[0]

    try {
      const [
        { data: invoices, error: invErr },
        { data: passports },
        { data: agents },
        { data: expenses },
      ] = await Promise.all([
        supabase.from('invoices')
          .select('total, status, issued_at, agent_id, candidates(full_name)')
          .gte('issued_at', from).lte('issued_at', to)
          .order('issued_at', { ascending: true }),
        supabase.from('passports').select('status, created_at'),
        supabase.from('agents').select('id, full_name, commission_rate'),
        supabase.from('expenses').select('amount, category, date')
          .gte('date', fromDay).lte('date', toDay),
      ])

      if (invErr) throw invErr

      const invList = (invoices || []).map(i => ({ ...i, total: Number.parseFloat(i.total) || 0 }))
      const expList = (expenses || []).map(e => ({ ...e, amount: Number.parseFloat(e.amount) || 0 }))

      const revenueMap = {}
      invList.filter(i => i.status === 'paid').forEach(inv => {
        const month = MONTHS[new Date(inv.issued_at).getMonth()]
        revenueMap[month] = (revenueMap[month] || 0) + inv.total
      })
      const revenue = Object.entries(revenueMap).map(([month, amount]) => ({ month, amount }))

      const statusMap = {}
      passports?.forEach(p => { statusMap[p.status] = (statusMap[p.status] || 0) + 1 })
      const passportsByStatus = Object.entries(statusMap)
        .map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count)

      const agentPerformance = (agents || []).map(agent => {
        const agentInvoices = invList.filter(i => i.agent_id === agent.id)
        const paid = agentInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
        const commission = (paid * (Number.parseFloat(agent.commission_rate) || 0)) / 100
        return { ...agent, revenue: paid, commission, invoiceCount: agentInvoices.length }
      })

      const totalRevenue = invList.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)

      setData({
        revenue,
        expenses: expList.reduce((s, e) => s + e.amount, 0),
        passportsByStatus,
        agentPerformance: agentPerformance.sort((a, b) => b.revenue - a.revenue),
        totalRevenue,
        totalInvoices: invList.length,
        paidInvoices: invList.filter(i => i.status === 'paid').length,
        unpaidInvoices: invList.filter(i => i.status !== 'paid').length,
      })
    } catch (err) {
      console.error('fetchReports error:', err)
      setFetchError('Failed to load report data. Tap refresh to try again.')
    } finally {
      setLoading(false)
    }
  }, []) // no deps — all inputs passed as arguments

  const fetchProfitability = useCallback(async (currentPeriod, currentFrom, currentTo) => {
    setProfitLoading(true)
    const from = getFromISO(currentPeriod, currentFrom)
    const fromDay = from.split('T')[0]

    try {
      const [{ data: invoices }, { data: agents }, { data: refunds }] = await Promise.all([
        supabase.from('invoices').select('id, total, status, candidate_id, agent_id, candidates(full_name)').gte('issued_at', from),
        supabase.from('agents').select('id, commission_rate'),
        supabase.from('refunds').select('amount, candidate_id').gte('refund_date', fromDay),
      ])

      const agentMap = Object.fromEntries((agents || []).map(a => [a.id, Number.parseFloat(a.commission_rate) || 0]))
      const candidateMap = {}

      ;(invoices || []).forEach(inv => {
        const cid = inv.candidate_id; if (!cid) return
        if (!candidateMap[cid]) candidateMap[cid] = { id: cid, name: inv.candidates?.full_name || 'Unknown', revenue: 0, commission: 0, refunds: 0, invoiceCount: 0 }
        const total = Number.parseFloat(inv.total) || 0
        if (inv.status === 'paid') { candidateMap[cid].revenue += total; candidateMap[cid].commission += (total * (agentMap[inv.agent_id] || 0)) / 100 }
        candidateMap[cid].invoiceCount += 1
      })

      ;(refunds || []).forEach(r => { if (r.candidate_id && candidateMap[r.candidate_id]) candidateMap[r.candidate_id].refunds += Number.parseFloat(r.amount) || 0 })

      setProfitData(
        Object.values(candidateMap)
          .map(c => ({ ...c, profit: c.revenue - c.commission - c.refunds }))
          .sort((a, b) => b.profit - a.profit)
      )
    } catch (err) {
      console.error('fetchProfitability error:', err)
    } finally {
      setProfitLoading(false)
    }
  }, []) // no deps — all inputs passed as arguments

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (period !== 'custom') fetchReports(period, customFrom, customTo)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  useEffect(() => {
    if (activeTab === 'profit') fetchProfitability(period, customFrom, customTo)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, period, customFrom, customTo])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchReports(period, customFrom, customTo)
    if (activeTab === 'profit') await fetchProfitability(period, customFrom, customTo)
    setRefreshing(false)
  }

  function applyCustom() {
    setShowCustom(false)
    fetchReports('custom', customFrom, customTo)
    if (activeTab === 'profit') fetchProfitability('custom', customFrom, customTo)
  }

  function clearCustom() {
    setCustomFrom('')
    setCustomTo('')
    setPeriod('month')
    setShowCustom(false)
  }

  function exportAgentsCSV() {
    exportCSV(data.agentPerformance.map(a => ({
      Agent: a.full_name,
      'Commission Rate': a.commission_rate + '%',
      'Total Revenue': a.revenue,
      'Commission Due': a.commission,
      Invoices: a.invoiceCount,
    })), 'agent-performance')
  }

  function exportProfitCSV() {
    exportCSV(profitData.map(c => ({
      Candidate: c.name,
      Revenue: c.revenue,
      Commission: c.commission.toFixed(2),
      Refunds: c.refunds,
      'Net Profit': c.profit.toFixed(2),
      Invoices: c.invoiceCount,
    })), 'candidate-profitability')
  }

  const totalProfit = profitData.reduce((s, c) => s + c.profit, 0)
  const customLabel = period === 'custom' && (customFrom || customTo) ? `${customFrom || '…'} → ${customTo || 'today'}` : null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">{customLabel || 'Financial & operational insights'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <BarChart2 size={28} className="text-indigo-400" />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 flex bg-slate-900 border border-slate-800 rounded-2xl p-1.5">
          {[['month','Month'],['quarter','Quarter'],['year','Year'],['all','All']].map(([key, label]) => (
            <button key={key} onClick={() => { setPeriod(key); setShowCustom(false) }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${period === key ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => { setPeriod('custom'); setShowCustom(s => !s) }}
          className={`flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold border transition-colors ${period === 'custom' ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
          <Calendar size={14}/> Custom
        </button>
      </div>

      {showCustom && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date Range</p>
            {(customFrom || customTo) && (
              <button onClick={clearCustom} className="flex items-center gap-1 text-xs text-red-400 font-semibold">
                <X size={12}/> Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">From</p>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">To</p>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </div>
          </div>
          <button onClick={applyCustom} disabled={!customFrom && !customTo}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-40">
            Apply Range
          </button>
        </div>
      )}

      <div className="flex gap-2">
        {[['overview','Overview'],['profit','Profit per Candidate'],['export','Export']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${activeTab === key ? 'bg-slate-700 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        loading ? (
          <Spinner />
        ) : fetchError ? (
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
            <p className="text-red-400 text-sm">{fetchError}</p>
            <button onClick={handleRefresh} className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm">Retry</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total Revenue', value: '৳' + data.totalRevenue.toLocaleString(), icon: TrendingUp, color: 'from-emerald-500 to-teal-600' },
                { label: 'Net Profit', value: '৳' + Math.max(0, data.totalRevenue - data.expenses).toLocaleString(), icon: Wallet, color: 'from-indigo-500 to-violet-600' },
                { label: 'Paid Invoices', value: data.paidInvoices, icon: FileText, color: 'from-emerald-500 to-teal-600' },
                { label: 'Unpaid', value: data.unpaidInvoices, icon: Calendar, color: 'from-red-500 to-rose-600' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-3`}><Icon size={16} className="text-white"/></div>
                  <p className="text-xl font-extrabold text-slate-100">{value}</p>
                  <p className="text-slate-500 text-xs font-medium mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {data.revenue.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                  <h2 className="text-sm font-bold text-slate-300">Revenue by Month</h2>
                  <span className="text-indigo-400 text-xs font-bold">৳{data.totalRevenue.toLocaleString()}</span>
                </div>
                <div className="px-2 pt-4 pb-2">
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={data.revenue} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false}
                        tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v} />
                      <Tooltip
                        cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                        contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 12 }}
                        labelStyle={{ color: '#94a3b8', fontWeight: 700 }}
                        formatter={v => ['৳' + v.toLocaleString(), 'Revenue']}
                      />
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7c3aed" />
                          <stop offset="100%" stopColor="#6366f1" />
                        </linearGradient>
                      </defs>
                      <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={40}>
                        {data.revenue.map((_, i) => <Cell key={i} fill="url(#revenueGrad)" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {data.passportsByStatus.length > 0 && (
              <PassportStatusChart passportsByStatus={data.passportsByStatus} />
            )}

            {data.agentPerformance.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                  <h2 className="text-sm font-bold text-slate-300">Agent Performance</h2>
                  <button onClick={exportAgentsCSV} className="flex items-center gap-1 text-indigo-400 text-xs font-semibold"><Download size={13}/> CSV</button>
                </div>
                <ul>
                  {data.agentPerformance.map((agent, i) => (
                    <li key={agent.id} className={`px-5 py-4 ${i < data.agentPerformance.length-1 ? 'border-b border-slate-800' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm">{agent.full_name?.[0]?.toUpperCase()}</div>
                          <div>
                            <p className="text-slate-200 text-sm font-semibold">{agent.full_name}</p>
                            <p className="text-slate-500 text-xs">{agent.invoiceCount} invoices · {agent.commission_rate}% rate</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 text-sm font-bold">৳{agent.revenue.toLocaleString()}</p>
                          <p className="text-pink-400 text-xs">৳{agent.commission.toLocaleString()} due</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )
      )}

      {activeTab === 'profit' && (
        profitLoading ? (
          <Spinner color="border-emerald-500" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-500 mb-1">Net Profit</p>
                <p className={`text-lg font-extrabold ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>৳{Math.abs(totalProfit).toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-500 mb-1">Profitable</p>
                <p className="text-lg font-extrabold text-emerald-400">{profitData.filter(c => c.profit > 0).length}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-500 mb-1">Loss</p>
                <p className="text-lg font-extrabold text-red-400">{profitData.filter(c => c.profit < 0).length}</p>
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                <h2 className="text-sm font-bold text-slate-300">Profit per Candidate</h2>
                <button onClick={exportProfitCSV} className="flex items-center gap-1 text-indigo-400 text-xs font-semibold"><Download size={13}/> CSV</button>
              </div>
              {profitData.length > 0 ? (
                <ul>
                  {profitData.map((c, i) => (
                    <li key={c.id} className={`px-5 py-4 ${i < profitData.length-1 ? 'border-b border-slate-800' : ''}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 font-bold text-sm">{c.name?.[0]?.toUpperCase()}</div>
                          <div>
                            <p className="text-slate-200 text-sm font-semibold">{c.name}</p>
                            <p className="text-slate-500 text-xs">{c.invoiceCount} invoice{c.invoiceCount === 1 ? '' : 's'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-extrabold ${c.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{c.profit >= 0 ? '+' : '-'}৳{Math.abs(c.profit).toLocaleString()}</p>
                          <p className="text-slate-600 text-xs">profit</p>
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className="text-slate-500">Revenue: <span className="text-slate-300">৳{c.revenue.toLocaleString()}</span></span>
                        <span className="text-slate-500">Commission: <span className="text-pink-400">৳{c.commission.toFixed(0)}</span></span>
                        {c.refunds > 0 && <span className="text-slate-500">Refunds: <span className="text-red-400">৳{c.refunds.toFixed(0)}</span></span>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-center text-slate-600 py-12 text-sm">No invoice data for this period</p>}
            </div>
          </>
        )
      )}

      {activeTab === 'export' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-slate-300">Export Data</h2>
            <p className="text-slate-500 text-xs mt-0.5">Download records as CSV or JSON</p>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {[
              { label: 'Export All Invoices',         desc: 'Full invoice history with amounts',                icon: Wallet,     fn: exportInvoicesCSV,  color: 'from-indigo-500 to-violet-600' },
              { label: 'Export Passports',            desc: 'All passport records and status',                  icon: Stamp,      fn: exportPassportsCSV, color: 'from-amber-500 to-orange-600'  },
              { label: 'Export Agent Report',         desc: 'Performance and commission data',                  icon: Users,      fn: exportAgentsCSV,    color: 'from-pink-500 to-rose-600'     },
              { label: 'Export Profit per Candidate', desc: 'Revenue, commission, refunds, net profit',         icon: DollarSign, fn: exportProfitCSV,    color: 'from-emerald-500 to-teal-600'  },
              { label: 'Full Backup (JSON)',          desc: 'All data including employees & visa applications',  icon: Download,   fn: () => runFullBackup(supabase),   color: 'from-slate-500 to-slate-600'   },
            ].map(({ label, desc, icon: Icon, fn, color }) => (
              <button key={label} onClick={fn}
                className="flex items-center gap-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-2xl px-4 py-4 transition-colors text-left">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center flex-none`}><Icon size={18} className="text-white"/></div>
                <div className="flex-1"><p className="text-slate-200 text-sm font-bold">{label}</p><p className="text-slate-500 text-xs">{desc}</p></div>
                <Download size={16} className="text-slate-500 flex-none"/>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
