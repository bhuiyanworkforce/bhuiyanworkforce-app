import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, X, Users, ChevronRight, ToggleLeft, ToggleRight, RefreshCw, AlertCircle, Trash2 } from 'lucide-react'
import { EMPLOYEE_ROLES as ROLES } from '../../lib/constants'
import { Spinner, ListSkeleton } from '../../components/Skeleton'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function AddEmployeeModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', role: 'other', phone: '', basic_salary: '', status: 'active' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function handleSave() {
    if (!form.name.trim() || !form.basic_salary) { setError('Name and basic salary are required'); return }
    setSaving(true)
    const { error: err } = await supabase.from('employees').insert({
      name: form.name.trim(),
      role: form.role,
      phone: form.phone || null,
      basic_salary: Number.parseFloat(form.basic_salary),
      status: 'active',
    })
    // FIX: setSaving(false) now called on both success and failure paths.
    // Previously it was only called on error — if onSaved() threw or the modal
    // failed to unmount, the Save button would remain disabled indefinitely.
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">Add Employee</h2>
          <button type="button" onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <div className="p-5 pb-24 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">
              <AlertCircle size={15} className="flex-none" />
              {error}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Full Name *</span>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Employee name"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Role</span>
            <select value={form.role} onChange={e => set('role', e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Phone</span>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="01XXXXXXXXX"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Basic Salary (৳) *</span>
            <input type="number" min="0" value={form.basic_salary} onChange={e => set('basic_salary', e.target.value)} placeholder="0"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"/>
          </label>
          <button type="button" onClick={handleSave} disabled={saving}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white py-3 rounded-xl font-bold text-sm mt-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Employee'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmployeeDetail({ employee: initial, onClose, onUpdated }) {
  const [employee, setEmployee] = useState(initial)
  const [payrolls, setPayrolls] = useState([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: initial.name, role: initial.role, phone: initial.phone || '', basic_salary: String(initial.basic_salary || '') })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [toggleError, setToggleError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleDelete() {
    await supabase.from('employee_payroll').delete().eq('employee_id', employee.id)
    await supabase.from('employees').delete().eq('id', employee.id)
    onUpdated()
    onClose()
  }

  useEffect(() => {
    supabase.from('employee_payroll').select('*').eq('employee_id', employee.id)
      .order('year', { ascending: false }).order('month', { ascending: false })
      .then(({ data }) => { setPayrolls(data || []) })
      .catch(err => { console.error('[EmployeeDetail] payroll load failed:', err) })
      .finally(() => { setLoading(false) })
  }, [employee.id])

  async function toggleStatus() {
    setToggling(true)
    setToggleError('')
    const newStatus = employee.status === 'active' ? 'inactive' : 'active'
    const { error } = await supabase.from('employees').update({ status: newStatus }).eq('id', employee.id)
    if (error) { setToggleError(error.message); setToggling(false); return }
    setEmployee(prev => ({ ...prev, status: newStatus }))
    onUpdated()
    setToggling(false)
  }

  async function saveEdit() {
    if (!editForm.name.trim() || !editForm.basic_salary) { setEditError('Name and salary are required'); return }
    setSaving(true)
    setEditError('')
    const { error } = await supabase.from('employees').update({
      name: editForm.name.trim(),
      role: editForm.role,
      phone: editForm.phone || null,
      basic_salary: Number.parseFloat(editForm.basic_salary),
    }).eq('id', employee.id)
    if (error) { setEditError(error.message); setSaving(false); return }
    setEmployee(prev => ({ ...prev, ...editForm, basic_salary: Number.parseFloat(editForm.basic_salary) }))
    setEditing(false)
    setSaving(false)
    onUpdated()
  }

  const totalPaid = payrolls.filter(p => p.status === 'paid').reduce((s, p) => s + Number.parseFloat(p.net_salary || 0), 0)
  const pendingCount = payrolls.filter(p => p.status === 'pending').length

  return (
    <div className="fixed inset-0 z-50 bg-[#050D1A] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#080F1E] border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={22}/></button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 font-bold text-sm">{employee.name}</p>
          <p className="text-slate-500 text-xs capitalize">{employee.role?.replace('_', ' ')} {employee.phone ? '· ' + employee.phone : ''}</p>
        </div>
        <button type="button" onClick={() => { setEditing(true); setEditError('') }} className="text-xs text-indigo-400 font-bold px-3 py-1.5 bg-indigo-500/10 rounded-xl">Edit</button>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-500 px-2 py-1">Cancel</button>
            <button onClick={handleDelete} className="flex items-center gap-1 bg-red-500/20 text-red-400 px-3 py-1.5 rounded-xl text-xs font-semibold">
              <Trash2 size={13}/> Confirm
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-slate-600 hover:text-red-400 transition-colors p-1.5">
            <Trash2 size={16}/>
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4">
        {toggleError && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-3 rounded-xl">
            <AlertCircle size={15} className="flex-none" /> {toggleError}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Basic Salary</p>
              <p className="text-2xl font-extrabold text-indigo-400">৳{Number.parseFloat(employee.basic_salary || 0).toLocaleString()}</p>
            </div>
            <button
              type="button"
              onClick={toggleStatus}
              disabled={toggling}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
                employee.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'
              }`}>
              {toggling
                ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : employee.status === 'active'
                  ? <><ToggleRight size={18}/> Active</>
                  : <><ToggleLeft size={18}/> Inactive</>
              }
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-extrabold text-slate-100">{payrolls.length}</p>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Payrolls</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-extrabold text-emerald-400">৳{totalPaid.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Total Paid</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-extrabold text-amber-400">{pendingCount}</p>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Pending</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <p className="text-sm font-bold text-slate-200">Payroll History</p>
          </div>
          {loading ? (
            <Spinner size="w-6 h-6" />
          ) : payrolls.length === 0 ? (
            <div className="py-8 text-center text-slate-600 text-sm">No payroll records</div>
          ) : (
            <ul>
              {payrolls.map((p, i) => (
                <li key={p.id} className={`flex items-center justify-between px-4 py-3 ${i < payrolls.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <div>
                    <p className="text-slate-200 text-sm font-semibold">{MONTHS[p.month - 1]} {p.year}</p>
                    <p className="text-slate-500 text-xs mt-0.5">Basic: ৳{Number.parseFloat(p.basic_salary || 0).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-slate-100 text-sm font-bold">৳{Number.parseFloat(p.net_salary || 0).toLocaleString()}</p>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${p.status === 'paid' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                      {p.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50">
          <div className="bg-[#0d1526] rounded-t-2xl w-full p-5 max-h-[80vh] overflow-y-auto pb-24">
            <h2 className="text-lg font-bold text-slate-100 mb-4">Edit Employee</h2>
            {editError && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl mb-4">
                <AlertCircle size={15} className="flex-none" /> {editError}
              </div>
            )}
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-semibold">Full Name *</span>
                <input value={editForm.name} onChange={e => setEditForm(p => ({...p, name: e.target.value}))}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"/>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-semibold">Role</span>
                <select value={editForm.role} onChange={e => setEditForm(p => ({...p, role: e.target.value}))}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
                  {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-semibold">Phone</span>
                <input value={editForm.phone} onChange={e => setEditForm(p => ({...p, phone: e.target.value}))}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"/>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-semibold">Basic Salary (৳) *</span>
                <input type="number" min="0" value={editForm.basic_salary} onChange={e => setEditForm(p => ({...p, basic_salary: e.target.value}))}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"/>
              </label>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setEditing(false)} className="flex-1 border border-slate-700 text-slate-300 rounded-xl py-2.5 text-sm font-semibold">Cancel</button>
                <button type="button" onClick={saveEdit} disabled={saving} className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('active')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)

  const fetchEmployees = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase.from('employees').select('*').order('name')
      if (err) throw err
      setEmployees(data || [])
    } catch {
      setError('Failed to load employees. Tap refresh to try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchEmployees()
    setRefreshing(false)
  }

  const filtered = filter === 'all' ? employees : employees.filter(e => e.status === filter)
  const activeCount = employees.filter(e => e.status === 'active').length
  const totalSalaryBill = employees.filter(e => e.status === 'active').reduce((s, e) => s + Number.parseFloat(e.basic_salary || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Employees</h1>
          <p className="text-slate-500 text-sm">{activeCount} active · {employees.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
            <Plus size={16}/> Add
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-none">
          <Users size={18} className="text-indigo-400"/>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Monthly Salary Bill</p>
          <p className="text-xl font-extrabold text-indigo-400">৳{totalSalaryBill.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {['active', 'inactive', 'all'].map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${filter === f ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {f}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-red-400 text-sm text-center">{error}</p>
          <button onClick={handleRefresh} className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm">Retry</button>
        </div>
      ) : loading ? (
        <ListSkeleton rows={6} hasSearch={false} hasTabs={false} />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-600">
              <Users size={32} className="mb-3"/>
              <p className="text-sm">No {filter !== 'all' ? filter : ''} employees found</p>
              {filter === 'active' && <button type="button" onClick={() => setShowAdd(true)} className="mt-4 text-indigo-400 text-sm font-semibold">Add first employee →</button>}
            </div>
          ) : (
            <ul>
              {filtered.map((emp, i) => (
                <li key={emp.id}
                  className={`flex items-center gap-3 px-4 py-4 transition-colors ${i < filtered.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <button
                    type="button"
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => setSelected(emp)}>
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 font-bold text-base flex-none">
                      {emp.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200 text-sm font-semibold">{emp.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-slate-500 text-xs capitalize">{emp.role?.replace('_', ' ')}</span>
                        {emp.phone && <><span className="text-slate-700 text-xs">·</span><span className="text-slate-500 text-xs">{emp.phone}</span></>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-none">
                      <p className="text-slate-200 text-sm font-bold">৳{Number.parseFloat(emp.basic_salary || 0).toLocaleString()}</p>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${emp.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                        {emp.status}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-slate-600 flex-none"/>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showAdd && <AddEmployeeModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchEmployees() }}/>}
      {selected && <EmployeeDetail employee={selected} onClose={() => setSelected(null)} onUpdated={fetchEmployees}/>}
    </div>
  )
}
