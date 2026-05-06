import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { ChevronDown, ChevronUp } from "lucide-react";

// Moved to outer scope (SonarCloud: move getChanges to outer scope)
function getChanges(l) {
  if (l.action !== "UPDATE" || !l.old_data || !l.new_data) return [];
  return Object.keys(l.new_data).filter(k =>
    JSON.stringify(l.old_data[k]) !== JSON.stringify(l.new_data[k]) && k !== "updated_at"
  );
}

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [filterTable, setFilterTable] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { fetchLogs(); }, [filterTable, filterAction]);

  async function fetchLogs() {
    let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
    if (filterTable !== "all") query = query.eq("table_name", filterTable);
    if (filterAction !== "all") query = query.eq("action", filterAction);
    const { data } = await query;
    setLogs(data || []);
  }

  const tables = ["all","invoices","passports","payroll","refunds","expenses","candidates","loans","cheques"];
  const actionColor = {
    INSERT: "bg-emerald-500/15 text-emerald-400",
    UPDATE: "bg-indigo-500/15 text-indigo-400",
    DELETE: "bg-red-500/15 text-red-400"
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-100">Audit Log</h1>
        <p className="text-slate-500 text-sm">Tap any entry to expand details</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tables.map(t => (
          <button key={t} onClick={() => setFilterTable(t)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap font-bold ${filterTable===t ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}>{t}</button>
        ))}
      </div>
      <div className="flex gap-2">
        {["all","INSERT","UPDATE","DELETE"].map(a => (
          <button key={a} onClick={() => setFilterAction(a)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${filterAction===a ? "bg-slate-200 text-slate-900" : "bg-slate-800 text-slate-400"}`}>{a}</button>
        ))}
      </div>
      {logs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-600 text-sm">No logs found</div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <ul>{logs.map((l, i) => {
            const changes = getChanges(l);
            const isOpen = expanded === l.id;
            return (
              <li key={l.id} className={`${i < logs.length-1 ? 'border-b border-slate-800' : ''}`}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : l.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-slate-800 transition-colors"
                >
                  <div className="flex gap-2 items-center flex-1 min-w-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-none ${actionColor[l.action] || 'bg-slate-700 text-slate-300'}`}>{l.action}</span>
                    <span className="text-sm font-semibold text-slate-300 truncate">{l.table_name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-none">
                    <span className="text-xs text-slate-500">{new Date(l.created_at).toLocaleDateString()}</span>
                    {isOpen ? <ChevronUp size={14} className="text-slate-500"/> : <ChevronDown size={14} className="text-slate-500"/>}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 bg-slate-800/30">
                    <p className="text-[10px] text-slate-500 font-mono mb-2">{new Date(l.created_at).toLocaleString()}</p>
                    {l.record_id && <p className="text-xs text-slate-500 mb-2 font-mono">ID: {l.record_id}</p>}
                    {l.action === "INSERT" && l.new_data && (
                      <div>
                        <p className="text-xs font-bold text-emerald-400 mb-1">New Record:</p>
                        {Object.entries(l.new_data).filter(([k]) => !['id','created_at','updated_at'].includes(k)).map(([k,v]) => (
                          <div key={k} className="flex gap-2 text-xs text-slate-400 mb-0.5">
                            <span className="text-slate-500 font-medium w-24 flex-none">{k}:</span>
                            <span className="truncate">{String(v ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {l.action === "UPDATE" && changes.length > 0 && (
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
                    {l.action === "DELETE" && l.old_data && (
                      <div>
                        <p className="text-xs font-bold text-red-400 mb-1">Deleted Record:</p>
                        {Object.entries(l.old_data).filter(([k]) => !['id','created_at','updated_at'].includes(k)).map(([k,v]) => (
                          <div key={k} className="flex gap-2 text-xs text-slate-400 mb-0.5">
                            <span className="text-slate-500 font-medium w-24 flex-none">{k}:</span>
                            <span className="truncate">{String(v ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {l.action === "UPDATE" && changes.length === 0 && (
                      <p className="text-xs text-slate-600">No visible field changes</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}</ul>
        </div>
      )}
    </div>
  );
}
