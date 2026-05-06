import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
  BarChart2, Download, TrendingUp, Users,
  Stamp, Wallet, FileText, Calendar, X, DollarSign
} from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Moved to outer scope (SonarCloud: move exportFullBackup to outer scope)
async function runFullBackup(supabaseClient) {
  const tables = ['candidates','passports','invoices','invoice_items','payments','agents','expenses','vendors','loans','cheques','payroll','refunds']
  const backup = {}
  for (const table of tables) { const { data } = await supabaseClient.from(table).select('*'); backup[table] = data || [] }
  backup.exported_at = new Date().toISOString()
  const a = document.createElement('a'); a.href = 'data:application/json,' + encodeURIComponent(JSON.stringify(backup, null, 2))
  a.download = 'agencyos-backup-' + new Date().toISOString().slice(0,10) + '.json'; a.click()
}

// Moved to outer scope (SonarCloud: move exportCSV to outer scope)
function exportCSV(rows, filename) {
  if (!rows.length) return
  const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).join(','))].join('\n')
  const a = document.createElement('a'); a.href = 'data:text/csv,' + encodeURIComponent(csv)
  a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`; a.click()
}

// Moved to outer scope (SonarCloud: move exportInvoicesCSV to outer scope)
async function exportInvoicesCSV() {
  const { data } = await supabase.from('invoices').select('invoice_no, status, total, issued_at, due_date, candidates(full_name), agents(full_name)').order('issued_at', { ascending: false })
  exportCSV((data||[]).map(i => ({ Invoice: i.invoice_no, Candidate: i.candidates?.full_name||'', Agent: i.agents?.full_name||'', Amount: i.total||0, Status: i.status, 'Issue Date': i.issued_at?.split('T')[0]||'', 'Due Date': i.due_date||'' })), 'invoices')
}

// Moved to outer scope (SonarCloud: move exportPassportsCSV to outer scope)
async function exportPassportsCSV() {
  const { data } = await supabase.from('passports').select('passport_no, status, issue_date, expiry_date, current_location, candidates(full_name, phone)').order('created_at', { ascending: false })
  exportCSV((data||[]).map(p => ({ 'Passport No': p.passport_no, Candidate: p.candidates?.full_name||'', Phone: p.candidates?.phone||'', Status: p.status, 'Issue Date': p.issue_date||'', 'Expiry Date': p.expiry_date||'', Location: p.current_location||'' })), 'passports')
}

export default function Reports() {
  const [loading, setLoading] = useState(true)
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

  useEffect(() => { if (period !== 'custom') fetchReports() }, [period])
  useEffect(() => { if (activeTab === 'profit') fetchProfitability() }, [activeTab, period])

  function getFromISO() {
    if (period === 'custom') return customFrom ? new Date(customFrom).toISOString() : '2000-01-01T00:00:00Z'
    const now = new Date(); const d = new Date()
    if (period === 'month')   d.setMonth(now.getMonth() - 1)
    if (period === 'quarter') d.setMonth(now.getMonth() - 3)
    if (period === 'year')    d.setFullYear(now.getFullYear() - 1)
    if (period === 'all')     return '2000-01-01T00:00:00Z'
    return d.toISOString()
  }
  function getToISO() {
    if (period === 'custom' && customTo) return new Date(customTo + 'T23:59:59').toISOString()
    return new Date().toISOString()
  }

  async function fetchReports() {
    setLoading(true)
    const from = getFromISO(); const to = getToISO()
    const fromDay = from.split('T')[0]; const toDay = to.split('T')[0]
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
      if (invErr) { setLoading(false); return }
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
        revenue, expenses: expList.reduce((s, e) => s + e.amount, 0), passportsByStatus,
        agentPerformance: agentPerformance.sort((a, b) => b.revenue - a.revenue),
        totalRevenue, totalInvoices: invList.length,
        paidInvoices: invList.filter(i => i.status === 'paid').length,
        unpaidInvoices: invList.filter(i => i.status !== 'paid').length,
      })
    } catch (err) { console.error('fetchReports error:', err) }
    finally { setLoading(false) }
  }

  async function fetchProfitability() {
    setProfitLoading(true)
    const from = getFromISO().split('T')[0]
    const [{ data: invoices }, { data: agents }, { data: refunds }] = await Promise.all([
      supabase.from('invoices').select('id, total, status, candidate_id, agent_id, candidates(full_name)').gte('issued_at', from),
      supabase.from('agents').select('id, commission_rate'),
      supabase.from('refunds').select('amount, candidate_id').gte('refund_date', from),
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
    setProfitData(Object.values(candidateMap).map(c => ({ ...c, profit: c.revenue - c.commission - c.refunds })).sort((a, b) => b.profit - a.profit))
    setProfitLoading(false)
  }

  function applyCustom() { setShowCustom(false); fetchReports() }
  function clearCustom() { setCustomFrom(''); setCustomTo(''); setPeriod('month'); setShowCustom(false) }

  function exportAgentsCSV() { exportCSV(data.agentPerformance.map(a => ({ Agent: a.full_name, 'Commission Rate': a.commission_rate+'%', 'Total Revenue': a.revenue, 'Commission Due': a.commission, Invoices: a.invoiceCount })), 'agent-performance') }
  function exportProfitCSV() { exportCSV(profitData.map(c => ({ Candidate: c.name, Revenue: c.revenue, Commission: c.commission.toFixed(2), Refunds: c.refunds, 'Net Profit': c.profit.toFixed(2), Invoices: c.invoiceCount })), 'candidate-profitability') }
  async function exportFullBackup() {
    await runFullBackup(supabase)
  }

  const maxRevenue = Math.max(...data.revenue.map(r => r.amount), 1)
  const maxPassport = Math.max(...data.passportsByStatus.map(p => p.count), 1)
  const STATUS_COLORS = { received:'bg-blue-400', interview:'bg-yellow-400', medical:'bg-orange-400', police_clearance:'bg-purple-400', bmet:'bg-cyan-400', calling_list:'bg-pink-400', visa_stamping:'bg-indigo-400', mofa:'bg-violet-400', traveling:'bg-emerald-400', returned:'bg-slate-400', cancelled:'bg-red-400' }
  const totalProfit = profitData.reduce((s, c) => s + c.profit, 0)
  const customLabel = period === 'custom' && (customFrom || customTo) ? `${customFrom || '…'} → ${customTo || 'today'}` : null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">{customLabel || 'Financial & operational insights'}</p>
        </div>
        <BarChart2 size={28} className="text-indigo-400" />
      </div>

      {/* Period selector + Custom button */}
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

      {/* Custom date range panel */}
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

      {/* Tab selector */}
      <div className="flex gap-2">
        {[['overview','Overview'],['profit','Profit per Candidate'],['export','Export']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${activeTab === key ? 'bg-slate-700 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
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
              <div className="p-5">
                <div className="flex items-end gap-2 h-32">
                  {data.revenue.map(({ month, amount }) => (
                    <div key={month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-slate-500 text-[9px] font-bold">৳{amount >= 1000 ? (amount/1000).toFixed(0)+'k' : amount}</span>
                      <div className="w-full bg-gradient-to-t from-indigo-500 to-violet-500 rounded-t-lg transition-all duration-500 min-h-[4px]" style={{ height: `${(amount/maxRevenue)*100}%` }}/>
                      <span className="text-slate-600 text-[9px]">{month}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {data.passportsByStatus.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800"><h2 className="text-sm font-bold text-slate-300">Passport Status Breakdown</h2></div>
              <div className="p-5 flex flex-col gap-3">
                {data.passportsByStatus.map(({ status, count }) => (
                  <div key={status}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-slate-300 text-xs font-medium capitalize">{status.replaceAll('_',' ')}</span>
                      <span className="text-slate-400 text-xs font-bold">{count}</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${STATUS_COLORS[status]||'bg-slate-400'} transition-all duration-700`} style={{ width: `${(count/maxPassport)*100}%` }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
      ))}

      {/* PROFIT TAB */}
      {activeTab === 'profit' && (profitLoading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"/></div>
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
                          {/* Fixed: unexpected negated condition — use === 1 for singular check */}
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
      ))}

      {/* EXPORT TAB */}
      {activeTab === 'export' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-slate-300">Export Data</h2>
            <p className="text-slate-500 text-xs mt-0.5">Download records as CSV files</p>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {[
              { label: 'Export All Invoices',         desc: 'Full invoice history with amounts',         icon: Wallet,      fn: exportInvoicesCSV,  color: 'from-indigo-500 to-violet-600' },
              { label: 'Export Passports',            desc: 'All passport records and status',           icon: Stamp,       fn: exportPassportsCSV, color: 'from-amber-500 to-orange-600'  },
              { label: 'Export Agent Report',         desc: 'Performance and commission data',           icon: Users,       fn: exportAgentsCSV,    color: 'from-pink-500 to-rose-600'     },
              { label: 'Export Profit per Candidate', desc: 'Revenue, commission, refunds, net profit',  icon: DollarSign,  fn: exportProfitCSV,    color: 'from-emerald-500 to-teal-600'  },
              { label: 'Full Backup (JSON)',          desc: 'All data: candidates, invoices, passports', icon: Download,    fn: exportFullBackup,   color: 'from-slate-500 to-slate-600'   },
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
