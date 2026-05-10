import PropTypes from 'prop-types'
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Plus, X } from "lucide-react";
import Modal from '../../components/Modal'
import { calcAgentNet, calcEmpNet } from "../../lib/utils";

// ─── AGENT PAYROLL ────────────────────────────────────────────────────────────
// calcAgentNet and calcEmpNet are now in src/lib/utils.js — single source of
// truth shared between the DB insert and the live preview.

function AddAgentPayrollModal({ onClose, onSaved }) {
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({
    agent_id: "", period_start: "", period_end: "",
    base_amount: "", commission_amount: "0", allowance: "0",
    overtime: "0", bonus: "0", deductions: "0",
    payment_method: "cash", status: "pending"
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // FIX: Escape key closes the modal (WCAG 2.1 SC 1.4.13)
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    supabase.from("agents").select("id, full_name").order("full_name")
      .then(({ data }) => setAgents(data || []));
  }, []);

  async function handleSave() {
    if (!form.agent_id || !form.period_start || !form.base_amount) {
      setError("Agent, period start and base amount are required"); return;
    }
    setSaving(true);
    // FIX: Use shared pure function — single source of truth for the formula.
    const net_amount = calcAgentNet(form);
    const base       = Number(form.base_amount)       || 0;
    const commission = Number(form.commission_amount)  || 0;
    const allowance  = Number(form.allowance)          || 0;
    const overtime   = Number(form.overtime)           || 0;
    const bonus      = Number(form.bonus)              || 0;
    const deductions = Number(form.deductions)         || 0;

    const { error: err } = await supabase.from("payroll").insert({
      agent_id: form.agent_id,
      period_start: form.period_start,
      period_end: form.period_end || null,
      base_amount: base,
      commission_amount: commission,
      allowance,
      overtime,
      bonus,
      deductions,
      net_amount,
      net_salary: net_amount,
      payment_method: form.payment_method,
      status: form.status,
      paid_at: form.status === "paid" ? new Date().toISOString() : null
    });
    if (err) { setError(err.message); setSaving(false); return; }
    onSaved();
  }

  // FIX: Live preview uses the shared pure function — guaranteed identical to the DB insert.
  const net = calcAgentNet(form);

  return (
    <Modal open onClose={onClose} title="Add Agent Payroll" maxWidth="max-w-lg">
      <div className="p-5 pb-10 flex flex-col gap-4">
        {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-semibold">Agent *</span>
          <select value={form.agent_id} onChange={e => set("agent_id", e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="">— Select Agent —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Period Start *</span>
            <input type="date" value={form.period_start} onChange={e => set("period_start", e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Period End</span>
            <input type="date" value={form.period_end} onChange={e => set("period_end", e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </label>
        </div>
        {[["Base Amount (৳) *","base_amount"],["Commission (৳)","commission_amount"],["Allowance (৳)","allowance"],["Overtime (৳)","overtime"],["Bonus (৳)","bonus"],["Deductions (৳)","deductions"]].map(([label, field]) => (
          <label key={field} className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">{label}</span>
            <input type="number" min="0" value={form[field]} onChange={e => set(field, e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-semibold">Payment Method</span>
          <select value={form.payment_method} onChange={e => set("payment_method", e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="cash">Cash</option>
            <option value="bank">Bank Transfer</option>
            <option value="mobile_banking">Mobile Banking</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-semibold">Status</span>
          <select value={form.status} onChange={e => set("status", e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <div className="bg-indigo-500/10 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">Net Amount</p>
          <p className="text-lg font-extrabold text-indigo-400">৳{net.toLocaleString()}</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50">
          {saving ? "Saving…" : "Save Payroll"}
        </button>
      </div>
    </Modal>
  );
}

AddAgentPayrollModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

function AgentPayrollDetail({ record, onClose, onUpdated }) {
  const [updating, setUpdating] = useState(false);

  async function markPaid() {
    setUpdating(true);
    await supabase.from("payroll").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", record.id);
    // Auto-create expense record
    const net = Number(record.net_amount || record.net_salary) || 0;
    await supabase.from("expenses").insert({
      date: new Date().toISOString().split("T")[0],
      category: "salary",
      description: `Agent payroll — ${record.agents?.full_name || "agent"}`,
      amount: net,
      payment_method: record.payment_method || "cash",
    });
    onUpdated();
    setUpdating(false);
    onClose();
  }

  const net = record.net_amount || record.net_salary || 0;

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22}/></button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-sm">{record.agents?.full_name}</p>
          <p className="text-slate-500 text-xs">
            {record.period_start ? new Date(record.period_start).toLocaleDateString() : "—"}
            {record.period_end ? " → " + new Date(record.period_end).toLocaleDateString() : ""}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-bold ${record.status === "paid" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
          {record.status}
        </span>
      </div>
      <div className="p-4 flex flex-col gap-4">
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 text-center">
          <p className="text-xs text-slate-500">Net Amount</p>
          <p className="text-3xl font-extrabold text-indigo-400">৳{(Number(net) || 0).toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          {[["Base", record.base_amount],["Commission", record.commission_amount],["Allowance", record.allowance],["Overtime", record.overtime],["Bonus", record.bonus],["Deductions", record.deductions]].map(([label, val]) => (
            <div key={label}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
              <p className={`text-sm font-semibold ${label === "Deductions" ? "text-red-400" : "text-slate-200"}`}>
                ৳{(Number(val) || 0).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Payment Method</p>
              <p className="text-slate-200 text-sm font-semibold capitalize">{record.payment_method || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Paid At</p>
              <p className="text-slate-200 text-sm font-semibold">{record.paid_at ? new Date(record.paid_at).toLocaleDateString() : "—"}</p>
            </div>
          </div>
        </div>
        {record.status === "pending" && (
          <button onClick={markPaid} disabled={updating}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50">
            {updating ? "Updating…" : "✓ Mark as Paid"}
          </button>
        )}
      </div>
    </div>
  );
}

AgentPayrollDetail.propTypes = {
  record: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    net_amount: PropTypes.number,
    net_salary: PropTypes.number,
    agents: PropTypes.shape({ full_name: PropTypes.string }),
    period_start: PropTypes.string,
    period_end: PropTypes.string,
    status: PropTypes.string,
    base_amount: PropTypes.number,
    commission_amount: PropTypes.number,
    allowance: PropTypes.number,
    overtime: PropTypes.number,
    bonus: PropTypes.number,
    deductions: PropTypes.number,
    payment_method: PropTypes.string,
    paid_at: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdated: PropTypes.func.isRequired,
};

// ─── EMPLOYEE PAYROLL ─────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function AddEmployeePayrollModal({ onClose, onSaved }) {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({
    employee_id: "", month: new Date().getMonth() + 1, year: new Date().getFullYear(),
    basic_salary: "", bonus: "0", deduction: "0",
    payment_method: "cash", payment_date: "", status: "pending", notes: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // FIX: Escape key closes the modal (WCAG 2.1 SC 1.4.13)
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    supabase.from("employees").select("id, name, basic_salary").eq("status", "active").order("name")
      .then(({ data }) => setEmployees(data || []));
  }, []);

  // Auto-fill basic salary when employee is selected
  function onEmployeeChange(id) {
    set("employee_id", id);
    const emp = employees.find(e => e.id === id);
    if (emp?.basic_salary) set("basic_salary", emp.basic_salary.toString());
  }

  async function handleSave() {
    if (!form.employee_id || !form.basic_salary) {
      setError("Employee and basic salary are required"); return;
    }
    setSaving(true);
    // FIX: Single source of truth for net salary calculation.
    const net_salary = calcEmpNet(form);
    const basic     = Number(form.basic_salary) || 0;
    const bonus     = Number(form.bonus)        || 0;
    const deduction = Number(form.deduction)    || 0;

    const { error: err } = await supabase.from("employee_payroll").insert({
      employee_id: form.employee_id,
      month: Number.parseInt(form.month),
      year: Number.parseInt(form.year),
      basic_salary: basic,
      bonus,
      deduction,
      net_salary,
      payment_method: form.payment_method,
      payment_date: form.payment_date || null,
      status: form.status,
      notes: form.notes || null
    });
    if (err) { setError(err.message); setSaving(false); return; }
    onSaved();
  }

  // FIX: Live preview uses shared pure function — guaranteed identical to the DB insert.
  const net = calcEmpNet(form);

  return (
    <Modal open onClose={onClose} title="Add Employee Payroll" maxWidth="max-w-lg">
      <div className="p-5 pb-10 flex flex-col gap-4">
        {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-semibold">Employee *</span>
          <select value={form.employee_id} onChange={e => onEmployeeChange(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="">— Select Employee —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Month *</span>
            <select value={form.month} onChange={e => set("month", e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Year *</span>
            <input type="number" value={form.year} onChange={e => set("year", e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </label>
        </div>
        {[["Basic Salary (৳) *","basic_salary"],["Bonus (৳)","bonus"],["Deduction (৳)","deduction"]].map(([label, field]) => (
          <label key={field} className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">{label}</span>
            <input type="number" min="0" value={form[field]} onChange={e => set(field, e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-semibold">Payment Method</span>
          <select value={form.payment_method} onChange={e => set("payment_method", e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="cash">Cash</option>
            <option value="bank">Bank Transfer</option>
            <option value="mobile_banking">Mobile Banking</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-semibold">Payment Date</span>
          <input type="date" value={form.payment_date} onChange={e => set("payment_date", e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-semibold">Status</span>
          <select value={form.status} onChange={e => set("status", e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-semibold">Notes</span>
          <input type="text" value={form.notes} onChange={e => set("notes", e.target.value)}
            placeholder="Optional"
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
        </label>
        <div className="bg-indigo-500/10 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">Net Salary</p>
          <p className="text-lg font-extrabold text-indigo-400">৳{net.toLocaleString()}</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50">
          {saving ? "Saving…" : "Save Payroll"}
        </button>
      </div>
    </Modal>
  );
          {error && <p className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">{error}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Employee *</span>
            <select value={form.employee_id} onChange={e => onEmployeeChange(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="">— Select Employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Month *</span>
              <select value={form.month} onChange={e => set("month", e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
                {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">Year *</span>
              <input type="number" value={form.year} onChange={e => set("year", e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </label>
          </div>
          {[["Basic Salary (৳) *","basic_salary"],["Bonus (৳)","bonus"],["Deduction (৳)","deduction"]].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-semibold">{label}</span>
              <input type="number" min="0" value={form[field]} onChange={e => set(field, e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Payment Method</span>
            <select value={form.payment_method} onChange={e => set("payment_method", e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
              <option value="mobile_banking">Mobile Banking</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Payment Date</span>
            <input type="date" value={form.payment_date} onChange={e => set("payment_date", e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Status</span>
            <select value={form.status} onChange={e => set("status", e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Notes</span>
            <input type="text" value={form.notes} onChange={e => set("notes", e.target.value)}
              placeholder="Optional"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"/>
          </label>
          <div className="bg-indigo-500/10 rounded-xl p-3 text-center">
            <p className="text-xs text-slate-500">Net Salary</p>
            <p className="text-lg font-extrabold text-indigo-400">৳{net.toLocaleString()}</p>
          </div>
  );
}

AddEmployeePayrollModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

function EmployeePayrollDetail({ record, onClose, onUpdated }) {
  const [updating, setUpdating] = useState(false);

  async function markPaid() {
    setUpdating(true);
    await supabase.from("employee_payroll").update({ status: "paid", payment_date: new Date().toISOString().split("T")[0] }).eq("id", record.id);
    // Auto-create expense record
    const net = Number(record.net_salary) || 0;
    await supabase.from("expenses").insert({
      date: new Date().toISOString().split("T")[0],
      category: "salary",
      description: `Employee payroll — ${record.employees?.name || "employee"}`,
      amount: net,
      payment_method: record.payment_method || "cash",
    });
    onUpdated();
    setUpdating(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22}/></button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-sm">{record.employees?.name}</p>
          <p className="text-slate-500 text-xs">{MONTHS[(record.month||1)-1]} {record.year}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-bold ${record.status === "paid" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
          {record.status}
        </span>
      </div>
      <div className="p-4 flex flex-col gap-4">
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 text-center">
          <p className="text-xs text-slate-500">Net Salary</p>
          <p className="text-3xl font-extrabold text-indigo-400">৳{(Number(record.net_salary) || 0).toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          {[["Basic", record.basic_salary],["Bonus", record.bonus],["Deduction", record.deduction]].map(([label, val]) => (
            <div key={label}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
              <p className={`text-sm font-semibold ${label === "Deduction" ? "text-red-400" : "text-slate-200"}`}>
                ৳{(Number(val) || 0).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Payment Method</p>
            <p className="text-slate-200 text-sm font-semibold capitalize">{record.payment_method || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Payment Date</p>
            <p className="text-slate-200 text-sm font-semibold">{record.payment_date ? new Date(record.payment_date).toLocaleDateString() : "—"}</p>
          </div>
          {record.notes && (
            <div className="col-span-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Notes</p>
              <p className="text-slate-300 text-sm">{record.notes}</p>
            </div>
          )}
        </div>
        {record.status === "pending" && (
          <button onClick={markPaid} disabled={updating}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50">
            {updating ? "Updating…" : "✓ Mark as Paid"}
          </button>
        )}
      </div>
    </div>
  );
}

EmployeePayrollDetail.propTypes = {
  record: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    net_salary: PropTypes.number,
    employees: PropTypes.shape({ name: PropTypes.string }),
    month: PropTypes.number,
    year: PropTypes.number,
    status: PropTypes.string,
    basic_salary: PropTypes.number,
    bonus: PropTypes.number,
    deduction: PropTypes.number,
    payment_method: PropTypes.string,
    payment_date: PropTypes.string,
    notes: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdated: PropTypes.func.isRequired,
};

export default function Payroll() {
  const [tab, setTab] = useState("agent");

  const [agentPayrolls, setAgentPayrolls] = useState([]);
  const [agentLoading, setAgentLoading] = useState(true);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agentFilter, setAgentFilter] = useState("all");

  const [empPayrolls, setEmpPayrolls] = useState([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [empFilter, setEmpFilter] = useState("all");

  useEffect(() => { fetchAgentPayrolls(); }, []);
  useEffect(() => { if (tab === "employee" && empPayrolls.length === 0) fetchEmpPayrolls(); }, [tab]);

  async function fetchAgentPayrolls() {
    setAgentLoading(true);
    try {
      const { data, error } = await supabase.from("payroll")
        .select("*, agents(full_name)")
        .order("period_start", { ascending: false });
      if (error) throw error;
      setAgentPayrolls(data || []);
    } catch (err) {
      console.error('[Payroll] fetchAgentPayrolls failed:', err);
      setAgentPayrolls([]);
    } finally {
      setAgentLoading(false);
    }
  }

  async function fetchEmpPayrolls() {
    setEmpLoading(true);
    try {
      const { data, error } = await supabase.from("employee_payroll")
        .select("*, employees(name, role)")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      setEmpPayrolls(data || []);
    } catch (err) {
      console.error('[Payroll] fetchEmpPayrolls failed:', err);
      setEmpPayrolls([]);
    } finally {
      setEmpLoading(false);
    }
  }

  const filteredAgent = agentFilter === "all" ? agentPayrolls : agentPayrolls.filter(p => p.status === agentFilter);
  const agentPending = agentPayrolls.filter(p => p.status === "pending").reduce((s, p) => s + (Number(p.net_amount || p.net_salary) || 0), 0);
  const agentPaid = agentPayrolls.filter(p => p.status === "paid").reduce((s, p) => s + (Number(p.net_amount || p.net_salary) || 0), 0);

  const filteredEmp = empFilter === "all" ? empPayrolls : empPayrolls.filter(p => p.status === empFilter);
  const empPending = empPayrolls.filter(p => p.status === "pending").reduce((s, p) => s + (Number(p.net_salary) || 0), 0);
  const empPaid = empPayrolls.filter(p => p.status === "paid").reduce((s, p) => s + (Number(p.net_salary) || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Payroll</h1>
          <p className="text-slate-500 text-sm">
            {tab === "agent" ? `${agentPayrolls.length} agent records` : `${empPayrolls.length} employee records`}
          </p>
        </div>
        <button
          onClick={() => tab === "agent" ? setShowAddAgent(true) : setShowAddEmp(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
          <Plus size={16}/> Add
        </button>
      </div>

      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
        {[["agent","Agent Payroll"],["employee","Employee Payroll"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${tab === key ? "bg-indigo-600 text-white" : "text-slate-400"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "agent" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-amber-500/10 border border-slate-800 rounded-2xl p-3">
              <p className="text-xs text-slate-500 font-semibold">Pending</p>
              <p className="text-lg font-extrabold text-amber-400">৳{agentPending.toLocaleString()}</p>
            </div>
            <div className="bg-emerald-500/10 border border-slate-800 rounded-2xl p-3">
              <p className="text-xs text-slate-500 font-semibold">Paid</p>
              <p className="text-lg font-extrabold text-emerald-400">৳{agentPaid.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {["all","pending","paid"].map(s => (
              <button key={s} onClick={() => setAgentFilter(s)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize ${agentFilter === s ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}>
                {s}
              </button>
            ))}
          </div>
          {agentLoading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              {filteredAgent.length === 0 ? (
                <p className="text-center text-slate-600 py-12 text-sm">No payroll records</p>
              ) : (
                <ul>{filteredAgent.map((p, i) => (
                  <li key={p.id}>
                  <button type="button" onClick={() => setSelectedAgent(p)}
                    className={`w-full text-left px-4 py-4 cursor-pointer active:bg-slate-800 transition-colors ${i < filteredAgent.length-1 ? "border-b border-slate-800" : ""}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-slate-200 text-sm font-semibold">{p.agents?.full_name || "—"}</p>
                        <p className="text-slate-500 text-xs">
                          {p.period_start ? new Date(p.period_start).toLocaleDateString() : "—"}
                          {p.period_end ? " → " + new Date(p.period_end).toLocaleDateString() : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <p className="text-white font-bold text-sm">৳{(Number(p.net_amount || p.net_salary) || 0).toLocaleString()}</p>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${p.status === "paid" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                  </button>
                  </li>
                ))}</ul>
              )}
            </div>
          )}
        </>
      )}

      {tab === "employee" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-amber-500/10 border border-slate-800 rounded-2xl p-3">
              <p className="text-xs text-slate-500 font-semibold">Pending</p>
              <p className="text-lg font-extrabold text-amber-400">৳{empPending.toLocaleString()}</p>
            </div>
            <div className="bg-emerald-500/10 border border-slate-800 rounded-2xl p-3">
              <p className="text-xs text-slate-500 font-semibold">Paid</p>
              <p className="text-lg font-extrabold text-emerald-400">৳{empPaid.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {["all","pending","paid"].map(s => (
              <button key={s} onClick={() => setEmpFilter(s)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize ${empFilter === s ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}>
                {s}
              </button>
            ))}
          </div>
          {empLoading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              {filteredEmp.length === 0 ? (
                <p className="text-center text-slate-600 py-12 text-sm">No employee payroll records</p>
              ) : (
                <ul>{filteredEmp.map((p, i) => (
                  <li key={p.id}>
                  <button type="button" onClick={() => setSelectedEmp(p)}
                    className={`w-full text-left px-4 py-4 cursor-pointer active:bg-slate-800 transition-colors ${i < filteredEmp.length-1 ? "border-b border-slate-800" : ""}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-slate-200 text-sm font-semibold">{p.employees?.name || "—"}</p>
                        <p className="text-slate-500 text-xs">{p.employees?.role || ""} · {MONTHS[(p.month||1)-1]} {p.year}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <p className="text-white font-bold text-sm">৳{(Number(p.net_salary) || 0).toLocaleString()}</p>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${p.status === "paid" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                  </button>
                  </li>
                ))}</ul>
              )}
            </div>
          )}
        </>
      )}

      {showAddAgent && <AddAgentPayrollModal onClose={() => setShowAddAgent(false)} onSaved={() => { setShowAddAgent(false); fetchAgentPayrolls(); }}/>}
      {selectedAgent && <AgentPayrollDetail record={selectedAgent} onClose={() => setSelectedAgent(null)} onUpdated={fetchAgentPayrolls}/>}
      {showAddEmp && <AddEmployeePayrollModal onClose={() => setShowAddEmp(false)} onSaved={() => { setShowAddEmp(false); fetchEmpPayrolls(); }}/>}
      {selectedEmp && <EmployeePayrollDetail record={selectedEmp} onClose={() => setSelectedEmp(null)} onUpdated={fetchEmpPayrolls}/>}
    </div>
  );
}
