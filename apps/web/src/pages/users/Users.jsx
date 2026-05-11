import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, X, AlertCircle, RefreshCw, Shield, Mail, Users } from 'lucide-react'
import { ListSkeleton } from '../../components/Skeleton'

const APP_ROLES = ['manager', 'agent', 'assistant']

const ROLE_STYLES = {
  owner:     'bg-violet-500/15 text-violet-400',
  manager:   'bg-indigo-500/15 text-indigo-400',
  agent:     'bg-emerald-500/15 text-emerald-400',
  assistant: 'bg-amber-500/15 text-amber-400',
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://api.bhuiyanworkforce.com'

// Helper: authenticated fetch to our Cloudflare Worker API
async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  })

  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json
}

// ── Invite Modal ──────────────────────────────────────────────────────────────
function InviteUserModal({ onClose, onSaved }) {
  const [form, setForm]     = useState({ email: '', role: 'manager', full_name: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function handleInvite() {
    if (!form.email.trim()) { setError('Email is required'); return }
    setSaving(true)
    setError('')
    try {
      await apiFetch('/users/invite', {
        method: 'POST',
        body: JSON.stringify({
          email:     form.email.trim(),
          role:      form.role,
          full_name: form.full_name.trim() || null,
        }),
      })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-[#0D1626]">
          <h2 className="text-slate-100 font-bold text-lg">Invite User</h2>
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
            <span className="text-xs text-slate-500 font-semibold">Email *</span>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="user@example.com"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Full Name</span>
            <input
              type="text"
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Optional"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Role *</span>
            <select
              value={form.role}
              onChange={e => set('role', e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              {APP_ROLES.map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </label>

          <p className="text-xs text-slate-500">
            An invitation email will be sent. The user sets their own password on first login.
          </p>

          <button
            type="button"
            onClick={handleInvite}
            disabled={saving}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white py-3 rounded-xl font-bold text-sm mt-1 disabled:opacity-50"
          >
            {saving ? 'Sending Invite…' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Change Role Modal ─────────────────────────────────────────────────────────
function ChangeRoleModal({ user, onClose, onSaved }) {
  const [role, setRole]     = useState(user.role || 'manager')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleSave() {
    if (role === user.role) { onClose(); return }
    setSaving(true)
    setError('')
    try {
      await apiFetch(`/users/${user.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
      <div className="bg-[#0D1626] border border-slate-800 rounded-t-2xl w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-slate-100 font-bold text-lg">Change Role</h2>
          <button type="button" onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <div className="p-5 pb-10 flex flex-col gap-4">
          <p className="text-sm text-slate-400">{user.email}</p>
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-xl">
              <AlertCircle size={15} className="flex-none" />
              {error}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold">Role</span>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              {APP_ROLES.map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Role'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [editUser, setEditUser]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { users: data } = await apiFetch('/users')
      setUsers(data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleSaved() {
    setShowInvite(false)
    setEditUser(null)
    load()
  }

  return (
    <div className="min-h-screen bg-[#08050F] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#08050F]/90 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-indigo-400" />
          <h1 className="text-slate-100 font-bold text-base">Users</h1>
          {!loading && (
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
              {users.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-3 py-2 rounded-xl font-bold text-sm"
          >
            <Plus size={15} />
            Invite
          </button>
        </div>
      </div>

      <div className="px-4 pt-4">
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-3 rounded-xl mb-4">
            <AlertCircle size={15} className="flex-none" />
            {error}
          </div>
        )}

        {loading ? (
          <ListSkeleton />
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-600">
            <Users size={40} />
            <p className="text-sm">No users found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {users.map(user => (
              <button
                key={user.id}
                type="button"
                onClick={() => user.role !== 'owner' && setEditUser(user)}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3.5 flex items-center justify-between text-left active:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center flex-none">
                    <span className="text-indigo-400 font-bold text-sm uppercase">
                      {(user.full_name || user.email || '?')[0]}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-100 text-sm font-semibold truncate">
                      {user.full_name || '—'}
                    </p>
                    <p className="text-slate-500 text-xs truncate flex items-center gap-1">
                      <Mail size={10} />
                      {user.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-none ml-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${ROLE_STYLES[user.role] || 'bg-slate-700 text-slate-300'}`}>
                    {user.role || 'no role'}
                  </span>
                  {user.role !== 'owner' && (
                    <span className="text-slate-600 text-xs">›</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteUserModal onClose={() => setShowInvite(false)} onSaved={handleSaved} />
      )}
      {editUser && (
        <ChangeRoleModal user={editUser} onClose={() => setEditUser(null)} onSaved={handleSaved} />
      )}
    </div>
  )
}
