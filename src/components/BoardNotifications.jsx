import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LanguageContext'

// Notification bell for a team board (design / print). Shows rows from
// activity_log addressed to this team (RLS already limits what they can read).
export default function BoardNotifications({ role }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const readKey = `idhayam_team_notif_read_${role}`
  const [readIds, setReadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(readKey) || '[]') } catch { return [] }
  })

  const icon = (e) =>
    e.includes('arrived') ? '📥' : e.includes('Updated') || e.includes('updated') ? '✏️' : '🔔'

  const load = async () => {
    const { data } = await supabase
      .from('activity_log').select('*')
      .eq('target', role)
      .order('created_at', { ascending: false })
      .limit(40)
    setItems(data || [])
  }

  const dismiss = async (id) => {
    setItems((cur) => cur.filter((n) => n.id !== id))   // optimistic
    await supabase.from('activity_log').delete().eq('id', id)
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel(`team_notif_${role}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new?.target === role) {
          const a = payload.new
          toast(`${icon(a.event)} ${a.job_code} · ${a.customer_name} — ${a.event}`, { duration: 8000 })
        }
        load()  // refresh on insert or delete (keeps all shop screens in sync)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  const unread = useMemo(() => items.filter((n) => !readIds.includes(n.id)).length, [items, readIds])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) {
      const ids = items.map((n) => n.id)
      setReadIds(ids)
      localStorage.setItem(readKey, JSON.stringify(ids))
    }
  }

  return (
    <div className="relative">
      <button onClick={toggle}
        className="relative w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        title={t('common.notifications')}>
        <span className="text-xl leading-none">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-press text-white text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl shadow-cardHover border border-ink-50 z-50 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-ink-50 flex items-center justify-between">
                <span className="font-heading font-bold text-ink">{t('common.notifications')}</span>
                <span className="text-xs text-ink-300">{items.length}</span>
              </div>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-ink-50">
                {items.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-ink-300">
                    <div className="text-3xl mb-2 opacity-70">✅</div>
                    {t('common.allCaughtUp')}
                  </div>
                ) : (
                  items.map((n) => (
                    <div key={n.id} className="px-4 py-3 flex gap-3 items-start group">
                      <span className="text-lg leading-none mt-0.5">{icon(n.event)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-charcoal">{n.event}</span>
                        <span className="block text-xs text-ink-300">{n.job_code} · {n.customer_name}</span>
                      </span>
                      <button onClick={() => dismiss(n.id)} title="Dismiss"
                        className="shrink-0 w-6 h-6 rounded-full text-ink-300 hover:bg-ink-50 hover:text-press flex items-center justify-center leading-none">✕</button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
