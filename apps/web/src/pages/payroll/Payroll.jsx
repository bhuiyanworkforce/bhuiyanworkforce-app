import { useState } from 'react'
import AgentPayrollTab from './AgentPayroll'
import EmployeePayrollTab from './EmployeePayroll'

// Payroll page — split into AgentPayroll.jsx and EmployeePayroll.jsx.
// This file is now just the tab shell; all component logic lives in those files.

export default function Payroll() {
  const [tab, setTab] = useState('agent')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold text-slate-100">Payroll</h1>

      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
        {[['agent','Agent Payroll'],['employee','Employee Payroll']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${tab === key ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'agent'    && <AgentPayrollTab />}
      {tab === 'employee' && <EmployeePayrollTab />}
    </div>
  )
}
