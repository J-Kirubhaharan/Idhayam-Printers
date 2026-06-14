import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { todayIST, formatDate, formatTime12, deliveryDeadline } from '../lib/format'
import JobDetailPanel from './JobDetailPanel'

// toast that carries a small ✕ so it can be dismissed instantly (it pops up over
// the top-right buttons, so the owner shouldn't have to wait for it to fade)
const popClose = (text, opts) => toast((t) => (
  <span className="flex items-center gap-2.5">
    <span className="leading-snug">{text}</span>
    <button onClick={() => toast.dismiss(t.id)}
      className="shrink-0 -mr-1 w-5 h-5 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white text-xs leading-none transition-colors">✕</button>
  </span>
), opts)

const SEEN_KEY = 'idhayam_notif_seen'
const READ_KEY = 'idhayam_notif_read'
const DISMISS_KEY = 'idhayam_notif_dismissed'  // reminder keys the owner cleared
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
  const [selectedJob, setSelectedJob] = useState(null)
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
              key: `time-${j.id}`, kind: 'time', big: true, hrs,
              icon: '⏰', title: `Finish in ${humanize(hrs)}`,
              detail: `${type} for ${who} · by ${formatTime12(j.delivery_time)}`,
              jobId: j.job_id, jobUuid: j.id
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
          jobId: j.job_id, jobUuid: j.id
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
            jobId: j.job_id, jobUuid: j.id
          })
        }
      }
    }

    // recent production activity (design / print team handoffs) — owner only
    const { data: acts } = await supabase
      .from('activity_log').select('*').eq('target', 'owner').order('created_at', { ascending: false }).limit(30)
    for (const a of (acts || [])) {
      notes.push({
        key: `act-${a.id}`, kind: 'activity', id: a.id, ts: new Date(a.created_at).getTime(),
        icon: a.event.includes('finished') ? '✅' : a.event.includes('Design') ? '🎨' : '🖨',
        title: a.event,
        detail: `${a.job_code} · ${a.customer_name}`,
        jobUuid: a.job_id
      })
    }

    // order: urgent timed reminders first (soonest deadline), then newest activity,
    // then due-tomorrow, then ready-stale
    const rank = { time: 0, activity: 1, due: 2, ready: 3 }
    notes.sort((a, b) => {
      const r = (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9)
      if (r !== 0) return r
      if (a.kind === 'time') return (a.hrs ?? 99) - (b.hrs ?? 99)
      if (a.kind === 'activity') return (b.ts ?? 0) - (a.ts ?? 0)
      return 0
    })

    // hide reminders the owner has dismissed; prune that list to live keys
    const currentKeys = notes.map((n) => n.key)
    const dismissed = getArr(DISMISS_KEY).filter((k) => currentKeys.includes(k))
    setArr(DISMISS_KEY, dismissed)
    const visible = notes.filter((n) => !dismissed.includes(n.key))

    // popups for newly-appeared notifications (deduped via localStorage)
    const seen = getArr(SEEN_KEY)
    visible.forEach((n) => {
      if (!seen.includes(n.key) && n.kind !== 'activity') {
        if (n.big) {
          popClose(`⏰ ${n.title} — ${n.detail}`, {
            duration: 12000,
            style: { background: '#E63946', color: '#fff', fontWeight: 600, fontSize: '15px' }
          })
        } else {
          popClose(`${n.icon} ${n.title}: ${n.detail}`, { duration: 7000 })
        }
      }
    })
    setArr(SEEN_KEY, visible.map((n) => n.key)) // prune to what's currently shown

    setItems(visible)
  }

  useEffect(() => {
    compute()
    const id = setInterval(() => { tick.current++; compute() }, 60000)
    // recompute right after a job is created/edited, and when returning to the tab
    const refresh = () => compute()
    window.addEventListener('idhayam:refresh-notifs', refresh)
    window.addEventListener('focus', refresh)
    // live toast + refresh whenever a team starts/finishes a stage
    const ch = supabase
      .channel('owner_activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
        const a = payload.new
        if (a.target !== 'owner') return
        const icon = a.event.includes('finished') ? '✅' : a.event.includes('Design') ? '🎨' : '🖨'
        popClose(`${icon} ${a.job_code} · ${a.customer_name} — ${a.event}`, { duration: 7000 })
        compute()
      })
      .subscribe()
    return () => {
      clearInterval(id)
      window.removeEventListener('idhayam:refresh-notifs', refresh)
      window.removeEventListener('focus', refresh)
      supabase.removeChannel(ch)
    }
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

  // open the slide-in job detail panel for the notification's job
  const go = async (n) => {
    setOpen(false)
    if (!n.jobUuid) return
    const { data } = await supabase
      .from('jobs').select('*, customers(name,contact,alt_contact,place)')
      .eq('id', n.jobUuid).is('deleted_at', null).maybeSingle()
    if (data) setSelectedJob(data)
    else toast('That job is no longer available.')
  }

  const refreshSelected = async () => {
    compute()
    if (!selectedJob) return
    const { data } = await supabase
      .from('jobs').select('*, customers(name,contact,alt_contact,place)')
      .eq('id', selectedJob.id).is('deleted_at', null).maybeSingle()
    setSelectedJob(data || null)
  }

  // dismiss any notification: activity events are deleted from the DB; reminders
  // are remembered locally so they stay cleared until they next become relevant.
  const dismiss = async (n) => {
    setItems((cur) => cur.filter((x) => x.key !== n.key))
    if (n.kind === 'activity' && n.id) {
      await supabase.from('activity_log').delete().eq('id', n.id)
    } else {
      const next = [...getArr(DISMISS_KEY), n.key]
      setArr(DISMISS_KEY, next)
    }
  }

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
                    <div key={n.key} className="flex items-start hover:bg-ink-50/50 transition-colors">
                      <button onClick={() => go(n)} className="flex-1 text-left px-4 py-3 flex gap-3 min-w-0">
                        <span className="text-lg leading-none mt-0.5">{n.icon}</span>
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${n.kind === 'time' ? 'text-press' : 'text-charcoal'}`}>{n.title}</span>
                          <span className="block text-xs text-ink-300">{n.detail}</span>
                        </span>
                      </button>
                      <button onClick={() => dismiss(n)} title="Dismiss"
                        className="shrink-0 w-6 h-6 mt-3 mr-3 rounded-full text-ink-300 hover:bg-ink-100 hover:text-press flex items-center justify-center leading-none">✕</button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onChanged={refreshSelected}
          onDuplicate={(job) => { setSelectedJob(null); navigate('/new-job', { state: { duplicate: job } }) }}
        />
      )}
    </div>
  )
}
