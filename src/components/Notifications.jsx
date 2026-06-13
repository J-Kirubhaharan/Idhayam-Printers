import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { todayIST, formatDate, formatTime12, deliveryDeadline } from '../lib/format'

const SEEN_KEY = 'idhayam_notif_seen'
const READ_KEY = 'idhayam_notif_read'
const getArr = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }
const setArr = (k, v) => localStorage.setItem(k, JSON.stringify(v))

const addDays = (yyyyMmDd, n) => {
  const d = new Date(`${yyyyMmDd}T00:00:00+05:30`)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}
const humanize = (hours) => {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function Notifications() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [readKeys, setReadKeys] = useState(getArr(READ_KEY))
  const tick = useRef(0)

  const compute = async () => {
    const { data } = await supabase
      .from('jobs')
      .select('id, job_id, quantity, job_type, custom_job_type, status, delivery_date, delivery_time, ready_at, customers(name)')
      .is('deleted_at', null).neq('status', 'Delivered')

    const today = todayIST()
    const tomorrow = addDays(today, 1)
    const now = new Date()
    const notes = []

    for (const j of (data || [])) {
      const who = j.customers?.name || '—'
      const type = j.job_type === 'Other' ? (j.custom_job_type || 'Job') : j.job_type

      // 1) timed deadline approaching (within 5 hours, not past)
      if (j.delivery_date && j.delivery_time) {
        const deadline = deliveryDeadline(j.delivery_date, j.delivery_time)
        if (deadline) {
          const hrs = (deadline - now) / 3600000
          if (hrs > 0 && hrs <= 5) {
            notes.push({
              key: `time-${j.id}`, kind: 'time', big: true,
              icon: '⏰', title: `Finish in ${humanize(hrs)}`,
              detail: `${type} for ${who} · by ${formatTime12(j.delivery_time)}`,
              jobId: j.job_id, to: '/jobs'
            })
            continue
          }
        }
      }

      // 2) due for delivery tomorrow
      if (j.delivery_date === tomorrow) {
        notes.push({
          key: `due-${j.id}`, kind: 'due', icon: '📅',
          title: 'Deliver tomorrow',
          detail: `${type} for ${who} (${j.job_id})`,
          jobId: j.job_id, to: '/jobs'
        })
      }

      // 3) ready for pickup for more than a day
      if (j.status === 'Ready for Pickup' && j.ready_at) {
        const days = (now - new Date(j.ready_at)) / 86400000
        if (days >= 1) {
          notes.push({
            key: `ready-${j.id}`, kind: 'ready', icon: '📦',
            title: 'Waiting for pickup over a day',
            detail: `${type} for ${who} — please follow up`,
            jobId: j.job_id, to: '/'
          })
        }
      }
    }

    // order: timed → due tomorrow → ready-stale
    const rank = { time: 0, due: 1, ready: 2 }
    notes.sort((a, b) => rank[a.kind] - rank[b.kind])

    // popups for newly-appeared notifications (deduped via localStorage)
    const seen = getArr(SEEN_KEY)
    const currentKeys = notes.map((n) => n.key)
    notes.forEach((n) => {
      if (!seen.includes(n.key)) {
        if (n.big) {
          toast(`⏰ ${n.title} — ${n.detail}`, {
            duration: 12000,
            style: { background: '#E63946', color: '#fff', fontWeight: 600, fontSize: '15px' }
          })
        } else {
          toast(`${n.icon} ${n.title}: ${n.detail}`, { duration: 7000 })
        }
      }
    })
    setArr(SEEN_KEY, currentKeys) // prune to what's currently active

    setItems(notes)
  }

  useEffect(() => {
    compute()
    const id = setInterval(() => { tick.current++; compute() }, 60000)
    return () => clearInterval(id)
  }, [])

  const unread = useMemo(() => items.filter((n) => !readKeys.includes(n.key)).length, [items, readKeys])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) {
      const keys = items.map((n) => n.key)
      setReadKeys(keys); setArr(READ_KEY, keys)
    }
  }

  const go = (n) => { setOpen(false); navigate(n.to) }

  return (
    <div className="relative">
      <button onClick={toggle}
        className="relative w-11 h-11 rounded-xl bg-white shadow-card flex items-center justify-center text-ink hover:shadow-cardHover transition-shadow"
        title="Notifications">
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
                <span className="font-heading font-bold text-ink">Notifications</span>
                <span className="text-xs text-ink-300">{items.length}</span>
              </div>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-ink-50">
                {items.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-ink-300">
                    <div className="text-3xl mb-2 opacity-70">✅</div>
                    You're all caught up
                  </div>
                ) : (
                  items.map((n) => (
                    <button key={n.key} onClick={() => go(n)}
                      className="w-full text-left px-4 py-3 hover:bg-ink-50/50 transition-colors flex gap-3">
                      <span className="text-lg leading-none mt-0.5">{n.icon}</span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-semibold ${n.kind === 'time' ? 'text-press' : 'text-charcoal'}`}>{n.title}</span>
                        <span className="block text-xs text-ink-300">{n.detail}</span>
                      </span>
                    </button>
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
