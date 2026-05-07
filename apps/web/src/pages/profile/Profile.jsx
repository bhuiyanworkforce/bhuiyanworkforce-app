import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { User, Phone, Mail, Lock, Save, CheckCircle, AlertCircle, Building, RefreshCw } from 'lucide-react'

export default function Profile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ full_name: '', phone: '' })
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchProfile = useCallback(async () => {
    if (!user) return
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (err && err.code !== 'PGRST116') throw err

      if (!data) {
        setError('Profile not found. Your account may not be fully set up yet.')
        setProfile(null)
        setForm({ full_name: user.email?.split('@')[0] || '', phone: '' })
      } else {
        setProfile(data)
        setForm({ full_name: data.full_name || '', phone: data.phone || '' })
      }
    } catch {
      setError('Failed to load profile. Tap refresh to try again.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  async function handleRefresh() {
    setRefreshing(true)
    setLoading(true)
    await fetchProfile()
    setRefreshing(false)
  }

  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

<<<<<<< HEAD
  async function handleAvatarUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) { showToast(uploadError.message, 'error'); setUploadingAvatar(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error: updateError } = await supabase.from('profiles')
  .update({ avatar_url: publicUrl }).eq('id', user.id)
    if (updateError) showToast(updateError.message, 'error')
    else { setAvatarUrl(publicUrl); showToast('Avatar updated!') }
    setUploadingAvatar(false)
  }

=======
>>>>>>> 69f0d5b (Improve: pagination, error states, refresh buttons, profit tab fix, full backup)
  async function handleSaveProfile() {
    if (!form.full_name) { showToast('Name is required', 'error'); return }
    if (!user) return
    setSaving(true)
    const { error: err } = await supabase.from('profiles')
      .update({ full_name: form.full_name, phone: form.phone }).eq('id', user.id)
    if (err) showToast(err.message, 'error')
    else showToast('Profile updated successfully!')
    setSaving(false)
  }

  async function handleChangePassword() {
    if (!passwords.new) { showToast('New password is required', 'error'); return }
    if (passwords.new.length < 8) { showToast('Password must be at least 8 characters', 'error'); return }
    if (passwords.new !== passwords.confirm) { showToast('Passwords do not match', 'error'); return }
    setChangingPassword(true)
    const { error: err } = await supabase.auth.updateUser({ password: passwords.new })
    if (err) showToast(err.message, 'error')
    else { showToast('Password changed successfully!'); setPasswords({ current: '', new: '', confirm: '' }) }
    setChangingPassword(false)
  }

  const ROLE_STYLES = {
    owner:   'bg-indigo-500/20 text-indigo-300',
    manager: 'bg-violet-500/20 text-violet-300',
    agent:   'bg-emerald-500/20 text-emerald-300',
    client:  'bg-amber-500/20 text-amber-300',
  }

  function getPasswordStrengthColor(len) {
    if (len >= 12) return 'bg-emerald-400'
    if (len >= 8) return 'bg-amber-400'
    return 'bg-red-400'
  }

  function getPasswordStrengthLabel(len) {
    if (len < 8) return 'Too short'
    if (len < 12) return 'Good'
    return 'Strong ✓'
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      {toast && (
        <div className={`fixed top-20 left-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg transition-all ${toast.type === 'error' ? 'bg-red-500/20 border border-red-500/40 text-red-300' : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'}`}>
          {toast.type === 'error' ? <AlertCircle size={18} className="flex-none" /> : <CheckCircle size={18} className="flex-none" />}
          <p className="text-sm font-semibold">{toast.message}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Profile</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage your account settings</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} className="text-red-400 flex-none" />
            <p className="text-red-400 text-sm font-semibold">{error}</p>
          </div>
          <button onClick={handleRefresh}
            className="self-start bg-red-500/20 text-red-300 font-bold px-4 py-2 rounded-xl text-sm">
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-extrabold text-2xl flex-none shadow-lg shadow-indigo-500/25">
              {form.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <p className="text-slate-100 font-bold text-lg">{form.full_name || 'No name set'}</p>
              <p className="text-slate-500 text-sm">{user?.email}</p>
              {profile?.role && (
                <span className={`inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full capitalize ${ROLE_STYLES[profile.role] || 'bg-slate-700 text-slate-300'}`}>
                  {profile.role}
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="text-sm font-bold text-slate-300">Personal Information</h2>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div>
                <label htmlFor="full-name" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Full Name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input id="full-name" type="text" value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label htmlFor="phone" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Phone</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input id="phone" type="tel" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="01XXXXXXXXX"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label htmlFor="email" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Email <span className="text-slate-600 font-normal">(cannot change)</span></label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input id="email" type="email" value={user?.email || ''} disabled
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-500 cursor-not-allowed" />
                </div>
              </div>
              {profile?.role && (
                <div>
                  <label htmlFor="role" className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Role <span className="text-slate-600 font-normal">(set by system)</span></label>
                  <div className="relative">
                    <Building size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input id="role" type="text" value={profile.role || ''} disabled
                      className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-500 cursor-not-allowed capitalize" />
                  </div>
                </div>
              )}
              <button onClick={handleSaveProfile} disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 shadow-lg shadow-indigo-500/20">
                {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Save size={16} /> Save Changes</>}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-300">Change Password</h2>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {[
            { label: 'New Password', key: 'new', placeholder: 'Min 8 characters', id: 'new-password' },
            { label: 'Confirm Password', key: 'confirm', placeholder: 'Repeat new password', id: 'confirm-password' },
          ].map(({ label, key, placeholder, id }) => (
            <div key={key}>
              <label htmlFor={id} className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">{label}</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input id={id} type="password" value={passwords[key]}
                  onChange={e => setPasswords(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
          ))}
          {passwords.new && (
            <div>
              <div className="flex gap-1 mb-1">
                {[1,2,3,4].map(i => {
                  const filled = passwords.new.length >= i * 3
                  const strengthColor = filled ? getPasswordStrengthColor(passwords.new.length) : 'bg-slate-700'
                  return <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${strengthColor}`} />
                })}
              </div>
              <p className="text-xs text-slate-500">{getPasswordStrengthLabel(passwords.new.length)}</p>
            </div>
          )}
          <button onClick={handleChangePassword} disabled={changingPassword || !passwords.new || !passwords.confirm}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 shadow-lg shadow-amber-500/20">
            {changingPassword ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Lock size={16} /> Change Password</>}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-slate-300 mb-4">App Information</h2>
        <div className="flex flex-col gap-3">
          {[
            { label: 'App Name', value: 'AgencyOS' },
            { label: 'Company', value: 'Bhuiyan Workforce Management' },
            { label: 'Version', value: '1.0.0' },
            { label: 'Domain', value: 'app.bhuiyanworkforce.com' },
            { label: 'Database', value: 'Supabase (Singapore)' },
            { label: 'Hosting', value: 'Cloudflare Pages' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-slate-500 text-xs font-semibold">{label}</span>
              <span className="text-slate-300 text-xs font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
