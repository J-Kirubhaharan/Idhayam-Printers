import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDate, formatTime12, todayIST } from '../lib/format'
import Clock from './Clock'

// team config: which stages this team works on, and the button for each stage
const CONFIG = {
  design: {
    title: 'Idhayam — Design',
    accent: 'bg-press',
    stages: ['Design Queue', 'Designing'],
    button: {
      'Design Queue': { label: 'Start Design', action: 'start_design', cls: 'bg-ink hover:bg-ink-600' },
      'Designing': { label: 'Design Finished ✓', action: 'finish_design', cls: 'bg-leaf hover:opacity-90' }
    }
  },
  print: {
    title: 'Idhayam — Printing',
    accent: 'bg-ink',
    stages: ['Print Queue', 'Printing'],
    button: {
      'Print Queue': { label: 'Start Printing', action: 'start_print', cls: 'bg-ink hover:bg-ink-600' },
      'Printing': { label: 'Printing Finished ✓', action: 'finish_print', cls: 'bg-leaf hover:opacity-90' }
    }
  }
}

const STAGE_PILL = {
  'Design Queue': 'bg-amber_warn/15 text-amber_warn',
  'Designing': 'bg-press/15 text-press',
  'Print Queue': 'bg-amber_warn/15 text-amber_warn',
  'Printing': 'bg-ink-100/60 text-ink'
}

export default function TeamBoard({ team }) {
  const cfg = CONFIG[team]
  const { signOut } = useAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const fetchBoard = async () => {
    const { data } = await supabase
      .from('job_board').select('*')
      .in('production_stage', cfg.stages)
      .order('is_urgent', { ascending: false })
      .order('delivery_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    setJobs(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchBoard()
    const channel = supabase
      .channel(`team_board_${team}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_board' }, () => fetchBoard())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team])

  const advance = async (job) => {
    const btn = cfg.button[job.production_stage]
    if (!btn) return
    setBusyId(job.id)
    const { error } = await supabase.rpc('advance_production', { p_job: job.id, p_action: btn.action })
    setBusyId(null)
    if (error) { toast.error('Could not update. Try again.'); return }
    toast.success(btn.action.startsWith('finish') ? 'Marked finished' : 'Work started')
    fetchBoard()
  }

  const urgentCount = useMemo(() => jobs.filter((j) => j.is_urgent).length, [jobs])
  const today = todayIST()

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="bg-ink text-white px-5 sm:px-8 py-4 flex items-center justify-between gap-4 shadow-md sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-xl ${cfg.accent} flex items-center justify-center shrink-0`}>
            <span className="font-heading font-extrabold text-white text-lg leading-none">IP</span>
          </div>
          <div className="min-w-0">
            <div className="font-heading font-bold text-lg sm:text-xl leading-tight truncate">{cfg.title}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
          <div className="text-right">
            <div className="font-mono font-bold text-2xl leading-none">{jobs.length}</div>
            <div className="text-[11px] text-ink-200">jobs</div>
          </div>
          {urgentCount > 0 && (
            <div className="text-right">
              <div className="font-mono font-bold text-2xl leading-none text-press-light">{urgentCount}</div>
              <div className="text-[11px] text-ink-200">urgent</div>
            </div>
          )}
          <button onClick={signOut}
            className="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <div className="flex justify-center mb-5"><Clock /></div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card"><div className="skeleton h-28 w-full rounded-xl" /></div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24">
            <div className="text-6xl mb-4 opacity-70">✅</div>
            <div className="font-heading font-bold text-2xl text-ink mb-1">Nothing pending</div>
            <div className="text-ink-300">New work will appear here automatically.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            <AnimatePresence>
              {jobs.map((j) => (
                <Card key={j.id} job={j} today={today} cfg={cfg} busy={busyId === j.id} onAdvance={() => advance(j)} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  )
}

function Card({ job, today, cfg, busy, onAdvance }) {
  const jobType = job.job_type === 'Other' ? job.custom_job_type : job.job_type
  const size = job.job_type === 'Flex' && (job.flex_width || job.flex_height)
    ? `${job.flex_width} × ${job.flex_height} ${job.flex_unit}`
    : (job.paper_size === 'Other' ? job.custom_paper_size : job.paper_size)

  const timeSuffix = job.delivery_time ? ` · ${formatTime12(job.delivery_time)}` : ''
  let dueCls = 'text-ink-400'
  let dueLabel = job.delivery_date ? formatDate(job.delivery_date) + timeSuffix : 'No date set'
  if (job.delivery_date) {
    if (job.delivery_date < today) { dueCls = 'text-press font-semibold'; dueLabel = `Overdue · ${formatDate(job.delivery_date)}${timeSuffix}` }
    else if (job.delivery_date === today) { dueCls = 'text-amber_warn font-semibold'; dueLabel = `Today · ${formatDate(job.delivery_date)}${timeSuffix}` }
  }

  const btn = cfg.button[job.production_stage]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className={`bg-white rounded-2xl shadow-card overflow-hidden border-l-4 ${job.is_urgent ? 'border-press' : 'border-transparent'}`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="font-mono text-sm text-ink-400">{job.job_id}</div>
          <div className="flex items-center gap-2">
            {job.is_urgent && <span className="pill bg-press text-white animate-pulse">⚡ URGENT</span>}
            <span className={`pill ${STAGE_PILL[job.production_stage] || 'bg-ink-50 text-ink-400'}`}>{job.production_stage}</span>
          </div>
        </div>

        <div className="font-heading font-bold text-xl text-ink leading-tight">{jobType}</div>
        <div className="text-sm text-ink-400 mb-3">
          {size ? <span>{size} · </span> : null}
          <span className="font-mono">Qty {job.quantity}</span>
        </div>

        <div className="space-y-1.5 text-sm border-t border-ink-50 pt-3 mb-4">
          <div className="flex justify-between"><span className="text-ink-300">Customer</span><span className="text-charcoal font-medium">{job.customer_name || '—'}</span></div>
          <div className="flex justify-between"><span className="text-ink-300">Delivery</span><span className={dueCls}>{dueLabel}</span></div>
          {job.assigned_to && <div className="flex justify-between"><span className="text-ink-300">Assigned</span><span className="text-charcoal">{job.assigned_to}</span></div>}
          {job.notes && (
            <div className="pt-1">
              <div className="text-ink-300 text-xs mb-0.5">Notes</div>
              <div className="text-charcoal whitespace-pre-wrap text-[13px]">{job.notes}</div>
            </div>
          )}
        </div>

        {btn && (
          <button onClick={onAdvance} disabled={busy}
            className={`${btn.cls} w-full text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60`}>
            {busy ? 'Saving…' : btn.label}
          </button>
        )}
      </div>
    </motion.div>
  )
}
