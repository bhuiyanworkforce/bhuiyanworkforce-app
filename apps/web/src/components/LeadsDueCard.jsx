import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, ChevronRight, CalendarClock, Reply, MailX } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Owner-only dashboard panel. The data is also protected by RLS on employer_leads;
// the caller decides whether to render it.
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function LeadsDueCard() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      const { data, error } = await supabase
        .from('employer_leads')
        .select('id, company_name, country, stage, next_follow_up, email_bounced')
        .not('stage', 'in', '("won","lost")')
        .eq('do_not_contact', false)
        .limit(1000)
      if (alive) setLeads(error || !Array.isArray(data) ? [] : data)
    }
    load()
    return () => { alive = false }
  }, [])

  if (!leads) return null

  const today = todayISO()
  const due = leads
    .filter(l => l.next_follow_up && l.next_follow_up <= today && l.stage !== 'replied' && l.stage !== 'negotiating')
    .sort((a, b) => a.next_follow_up.localeCompare(b.next_follow_up))
  const replied = leads.filter(l => l.stage === 'replied' || l.stage === 'negotiating')
  const bounced = leads.filter(l => l.email_bounced)

  if (due.length === 0 && replied.length === 0 && bounced.length === 0) return null

  const tiles = [
    { label: 'Follow-ups due', value: due.length, icon: CalendarClock, tone: 'text-amber-400' },
    { label: 'Replies to answer', value: replied.length, icon: Reply, tone: 'text-emerald-400' },
    { label: 'Bounced emails', value: bounced.length, icon: MailX, tone: 'text-red-400' },
  ]

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <button type="button" onClick={() => navigate('/employer-leads')}
        className="w-full flex items-center gap-2 px-4 py-3 border-b border-slate-800 text-left">
        <Target size={16} className="text-indigo-400" />
        <h3 className="text-sm font-bold text-slate-300 flex-1">Employer Leads</h3>
        <ChevronRight size={14} className="text-slate-600" />
      </button>
      <div className="grid grid-cols-3 divide-x divide-slate-800">
        {tiles.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="px-3 py-3 flex flex-col items-center text-center">
            <Icon size={15} className={tone} />
            <p className="text-lg font-extrabold text-slate-100 mt-1">{value}</p>
            <p className="text-slate-500 text-[10px] font-medium leading-tight">{label}</p>
          </div>
        ))}
      </div>
      {due.length > 0 && (
        <ul className="border-t border-slate-800">
          {due.slice(0, 5).map((l, i, arr) => (
            <li key={l.id} className={i < arr.length - 1 ? 'border-b border-slate-800' : ''}>
              <button type="button" onClick={() => navigate('/employer-leads')} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-slate-800">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-xs font-semibold truncate">{l.company_name}</p>
                  <p className="text-slate-500 text-[10px] truncate">{[l.country, `due ${l.next_follow_up}`].filter(Boolean).join(' · ')}</p>
                </div>
                <ChevronRight size={12} className="text-slate-600 flex-none" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
