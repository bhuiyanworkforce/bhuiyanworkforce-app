import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ChevronDown, ChevronUp, AlertTriangle, RefreshCw } from 'lucide-react'

// ─── BUG 5 FIX ───────────────────────────────────────────────────────────────
// The original fetchLogs() had no loading indicator, no error state, and no
// try/catch. On a failed query (network blip, RLS issue, etc.) the UI would
// silently stay blank — the "No logs found" empty state would show, which looks
// identical to "the table is genuinely empty". Users had no way to know
// something went wrong, and no way to retry.
//
// Fix:
//   - `loading` state drives a spinner while the query is in-flight.
//   - `error` state surfaces a human-readable message + Retry button.
//   - try/catch wraps the Supabase query so failures are caught, not silently
//     swallowed.
//   - `fetchLogs` is exposed to the Retry button so the user can recover without
//     a full page reload.
// ─────────────────────────────────────────────────────────────────────────────

function getChanges(l) {
  if (l.action !== 'UPDATE' || !l.old_data || !l.new_data) return []
  return Object.keys(l.new_data).filter(k =>
    JSON.stringify(l.old_data[k]) !== JSON.stringify(l.new_data[k]) && k !== 'updated_at'
  )
}

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [filterTable, setFilterTable] = useState('all')
  const [filterAction, setFilterAction] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { fetchLogs() }, [filterTable, filterAction])

  async function fetchLogs() {
    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (filterTable !== 'all') query = query.eq('table_name', filterTable)
      if (filterAction !== 'all') query = query.eq('action', filterAction)

      const { data, error: dbError } = await query

      if (dbError) throw dbError
      setLogs(data || [])
    } catch (err) {
      console.error('AuditLog fetchLogs failed:', err)
      setError('Failed to load audit logs. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const tables = ['all', 'invoices', 'passports', 'payroll', 'refunds', 'expenses', 'candidates', 'loans', 'cheques']
  const actionColor = {
    INSERT: 'bg-emerald-500/15 text-emerald-400',
    UPDATE: 'bg-indigo-500/15 text-indigo-400',
    DELETE: 'bg-red-500/15 text-red-400',
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Audit Log</h1>
          <p className="text-slate-500 text-sm">Tap any entry to expand details</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50"
          aria-label="Refresh audit log"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tables.map(t => (
          <button key={t} onClick={() => setFilterTable(t)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap font-bold ${
              filterTable === t ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {['all', 'INSERT', 'UPDATE', 'DELETE'].map(a => (
          <button key={a} onClick={() => setFilterAction(a)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${
              filterAction === a ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-400'
            }`}>
            {a}
          </button>
        ))}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
          <AlertTriangle size={28} className="text-red-400" />
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={fetchLogs}
            className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
            Retry
          </button>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && logs.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-600 text-sm">
          No logs found
        </div>
      )}

      {/* ── Results ── */}
      {!loading && !error && logs.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <ul>
            {logs.map((l, i) => {
              const changes = getChanges(l)
              const isOpen = expanded === l.id
              return (
                <li key={l.id} className={`${i < logs.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : l.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-slate-800 transition-colors"
                  >
                    <div className="flex gap-2 items-center flex-1 min-w-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-none ${actionColor[l.action] || 'bg-slate-700 text-slate-300'}`}>
                        {l.action}
                      </span>
                      <span className="text-sm font-semibold text-slate-300 truncate">{l.table_name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-none">
                      <span className="text-xs text-slate-500">{new Date(l.created_at).toLocaleDateString()}</span>
                      {isOpen
                        ? <ChevronUp size={14} className="text-slate-500" />
                        : <ChevronDown size={14} className="text-slate-500" />
                      }
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-3 bg-slate-800/30">
                      <p className="text-[10px] text-slate-500 font-mono mb-2">{new Date(l.created_at).toLocaleString()}</p>
                      {l.record_id && <p className="text-xs text-slate-500 mb-2 font-mono">ID: {l.record_id}</p>}

                      {l.action === 'INSERT' && l.new_data && (
                        <div>
                          <p className="text-xs font-bold text-emerald-400 mb-1">New Record:</p>
                          {Object.entries(l.new_data)
                            .filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k))
                            .map(([k, v]) => (
                              <div key={k} className="flex gap-2 text-xs text-slate-400 mb-0.5">
                                <span className="text-slate-500 font-medium w-24 flex-none">{k}:</span>
                                <span className="truncate">{String(v ?? '—')}</span>
                              </div>
                            ))}
                        </div>
                      )}

                      {l.action === 'UPDATE' && changes.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-indigo-400 mb-1">Changes:</p>
                          {changes.map(k => (
                            <div key={k} className="text-xs mb-1">
                              <span className="text-slate-500 font-medium">{k}: </span>
                              <span className="text-red-400 line-through mr-1">{String(l.old_data[k] ?? '—')}</span>
                              <span className="text-emerald-400">{String(l.new_data[k] ?? '—')}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {l.action === 'DELETE' && l.old_data && (
                        <div>
                          <p className="text-xs font-bold text-red-400 mb-1">Deleted Record:</p>
                          {Object.entries(l.old_data)
                            .filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k))
                            .map(([k, v]) => (
                              <div key={k} className="flex gap-2 text-xs text-slate-400 mb-0.5">
                                <span className="text-slate-500 font-medium w-24 flex-none">{k}:</span>
                                <span className="truncate">{String(v ?? '—')}</span>
                              </div>
                            ))}
                        </div>
                      )}

                      {l.action === 'UPDATE' && changes.length === 0 && (
                        <p className="text-xs text-slate-600">No visible field changes</p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
