import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Users, Wallet, TrendingUp } from 'lucide-react'
import AddAgentModal from './AddAgentModal'
import AgentDetail from './AgentDetail'

export default function Agents() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [summary, setSummary] = useState({ total: 0, totalCommission: 0 })

  useEffect(() => { fetchAgents() }, [])

  async function fetchAgents() {
    setLoading(true)
    try {
      const [
        { data: agentsData, error: e1 },
        { data: invoicesData },
        { data: candidateCounts },
      ] = await Promise.all([
        supabase.from('agents').select('*').order('created_at', { ascending: false }),
        supabase.from('invoices').select('agent_id, total, status'),
        supabase.from('candidates').select('agent_id'),
      ])
      if (e1) throw e1

      const agents = agentsData || []
      const invoices = invoicesData || []
      const candidates = candidateCounts || []

      const agentsWithStats = agents.map(agent => {
        const agentInvoices = invoices.filter(i => i.agent_id === agent.id)
        const paidTotal = agentInvoices
          .filter(i => i.status === 'paid')
          .reduce((s, i) => s + Number.parseFloat(i.total || 0), 0)
        const commission = (paidTotal * (Number.parseFloat(agent.commission_rate) || 0)) / 100
        const candidateCount = candidates.filter(c => c.agent_id === agent.id).length
        return { ...agent, candidateCount, paidTotal, commission }
      })

      setAgents(agentsWithStats)
      setSummary({
        total: agentsWithStats.length,
        totalCommission: agentsWithStats.reduce((s, a) => s + a.commission, 0),
      })
    } catch (err) {
      console.error('[Agents] fetchAgents failed:', err)
      setAgents([])
    } finally {
      setLoading(false)
    }
  }

  const COLORS = [
    'from-indigo-500 to-violet-600', 'from-emerald-500 to-teal-600',
    'from-pink-500 to-rose-600',     'from-amber-500 to-orange-600',
    'from-cyan-500 to-blue-600',     'from-purple-500 to-pink-600',
  ]

  function renderAgentList() {
    if (loading) {
      return (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )
    }
    if (agents.length === 0) {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-pink-500/15 flex items-center justify-center mb-4">
            <Users size={24} className="text-pink-400" />
          </div>
          <h3 className="text-slate-200 font-bold mb-2">No Agents Yet</h3>
          <p className="text-slate-500 text-sm mb-4">Add your first agent to track commissions</p>
          <button onClick={() => setShowAdd(true)}
            className="bg-gradient-to-r from-pink-500 to-rose-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
            Add First Agent
          </button>
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-3">
        {agents.map((agent, i) => (
          <button key={agent.id} onClick={() => setSelected(agent)}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left active:bg-slate-800 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${COLORS[i % COLORS.length]} flex items-center justify-center text-white font-extrabold text-lg flex-none`}>
                {agent.full_name?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-100 font-bold text-base truncate">{agent.full_name}</p>
                <p className="text-slate-500 text-xs">{agent.phone}</p>
              </div>
              <div className="flex items-center gap-1 bg-indigo-500/15 px-2.5 py-1 rounded-full">
                <TrendingUp size={11} className="text-indigo-400" />
                <span className="text-indigo-400 text-xs font-bold">{agent.commission_rate}%</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Candidates', value: agent.candidateCount },
                { label: 'Revenue',    value: '৳' + (agent.paidTotal || 0).toLocaleString() },
                { label: 'Commission', value: '৳' + (agent.commission || 0).toLocaleString() },
              ].map(m => (
                <div key={m.label} className="bg-slate-800/60 rounded-xl p-2.5 text-center">
                  <p className="text-slate-100 text-sm font-bold">{m.value}</p>
                  <p className="text-slate-500 text-[10px] font-medium mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-100">Agents</h1>
            <p className="text-slate-500 text-sm">{agents.length} total</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
            <Plus size={16} /> Add
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="w-8 h-8 rounded-xl bg-pink-500/20 flex items-center justify-center mb-2">
              <Users size={15} className="text-pink-400" />
            </div>
            <p className="text-xl font-extrabold text-slate-100">{summary.total}</p>
            <p className="text-slate-500 text-xs mt-0.5">Total Agents</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-2">
              <Wallet size={15} className="text-emerald-400" />
            </div>
            <p className="text-xl font-extrabold text-slate-100">৳{summary.totalCommission.toLocaleString()}</p>
            <p className="text-slate-500 text-xs mt-0.5">Total Commission</p>
          </div>
        </div>

        {renderAgentList()}
      </div>

      {showAdd && (
        <AddAgentModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchAgents() }} />
      )}
      {selected && (
        <AgentDetail agent={selected} onClose={() => { setSelected(null); fetchAgents() }} />
      )}
    </>
  )
}
