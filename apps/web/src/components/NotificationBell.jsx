import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Bell, Check, CheckCheck, X, AlertTriangle } from 'lucide-react'

const TYPE_STYLES = {
  info:    { bg: 'bg-indigo-500/15', text: 'text-indigo-400',  dot: 'bg-indigo-400'  },
  success: { bg: 'bg-emerald-500/15',text: 'text-emerald-400', dot: 'bg-emerald-400' },
  warning: { bg: 'bg-amber-500/15',  text: 'text-amber-400',   dot: 'bg-amber-400'   },
  error:   { bg: 'bg-red-500/15',    text: 'text-red-400',     dot: 'bg-red-400'     },
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function subscribeToNotifications(userId, onInsert) {
  return supabase
    .channel(`notifications:${userId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      onInsert(payload.new)
    })
    .subscribe()
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [userId, setUserId] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const panelRef = useRef(null)

  const unreadCount = notifications.filter(n => n.is_read === false).length

  useEffect(() => {
    let channel

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      await fetchNotificationsForUser(user.id)

      channel = subscribeToNotifications(user.id, (newNotification) => {
        setNotifications(prev => [newNotification, ...prev])
      })
    }

    init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
        setConfirmClear(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // FIX: Previously discarded the error from Supabase, silently showing an
  // empty list on failure. Now surfaces the error so the user knows something
  // went wrong instead of thinking there are no notifications.
  async function fetchNotificationsForUser(uid) {
    setFetchError(null)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('Failed to fetch notifications:', error)
      setFetchError('Could not load notifications.')
      return
    }

    setNotifications(data || [])
  }

  async function markAsRead(id) {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    if (error) { console.error('markAsRead failed:', error); return }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  async function markAllAsRead() {
    if (!userId || loading) return
    setLoading(true)
    const { error } = await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', userId).eq('is_read', false)
    if (error) {
      console.error('markAllAsRead failed:', error)
      setFetchError('Failed to mark notifications as read.')
    } else {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    }
    setLoading(false)
  }

  async function deleteNotification(id) {
    const { error } = await supabase.from('notifications').delete().eq('id', id)
    if (error) { console.error('deleteNotification failed:', error); return }
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function clearAllNotifications() {
    if (!userId) return
    const { error } = await supabase.from('notifications').delete().eq('user_id', userId)
    if (error) { console.error('clearAllNotifications failed:', error); return }
    setNotifications([])
    setConfirmClear(false)
  }

  const bellAriaLabel = unreadCount > 0
    ? `Notifications (${unreadCount} unread)`
    : 'Notifications'

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-slate-400 hover:text-slate-200 transition-colors"
        aria-label={bellAriaLabel}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[80vh] bg-[#080F1E] border border-slate-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-none">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-200">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} disabled={loading}
                className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-xs font-semibold transition-colors">
                <CheckCheck size={13} />Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {/* FIX: Show error state when fetch failed */}
            {fetchError ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-4">
                <AlertTriangle size={24} className="text-red-400" />
                <p className="text-red-400 text-sm">{fetchError}</p>
                <button
                  onClick={() => userId && fetchNotificationsForUser(userId)}
                  className="text-indigo-400 text-xs font-semibold"
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                <Bell size={28} className="mb-3" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <ul>
                {notifications.map((n) => {
                  const style = TYPE_STYLES[n.type] || TYPE_STYLES.info
                  const isUnread = n.is_read === false
                  return (
                    <li
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 last:border-0 transition-colors ${isUnread ? 'bg-slate-800/30' : ''}`}
                    >
                      <div className="flex-none mt-1.5">
                        {isUnread
                          ? <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                          : <div className="w-2 h-2 rounded-full bg-slate-700" />}
                      </div>
                      <button
                        type="button"
                        className={`flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer ${isUnread ? '' : 'cursor-default'}`}
                        onClick={() => isUnread && markAsRead(n.id)}
                        aria-label={isUnread ? `Mark "${n.title}" as read` : n.title}
                        tabIndex={isUnread ? 0 : -1}
                      >
                        <p className={`text-xs font-bold mb-0.5 ${isUnread ? 'text-slate-200' : 'text-slate-400'}`}>{n.title}</p>
                        <p className="text-slate-500 text-xs leading-relaxed">{n.message}</p>
                        <p className="text-slate-600 text-[10px] mt-1">{timeAgo(n.created_at)}</p>
                      </button>
                      <div className="flex-none flex items-center gap-1">
                        {isUnread && (
                          <button onClick={() => markAsRead(n.id)} className="p-1 text-slate-600 hover:text-indigo-400 transition-colors" title="Mark as read">
                            <Check size={13} />
                          </button>
                        )}
                        <button onClick={() => deleteNotification(n.id)} className="p-1 text-slate-600 hover:text-red-400 transition-colors" title="Delete">
                          <X size={13} />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-800 flex-none">
              {confirmClear ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">Clear all notifications?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="text-xs text-slate-500 hover:text-slate-300 font-semibold transition-colors px-2 py-1">
                      Cancel
                    </button>
                    <button
                      onClick={clearAllNotifications}
                      className="text-xs text-red-400 hover:text-red-300 font-bold transition-colors px-2 py-1">
                      Clear all
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="text-xs text-slate-600 hover:text-red-400 font-semibold transition-colors w-full text-center">
                  Clear all notifications
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
