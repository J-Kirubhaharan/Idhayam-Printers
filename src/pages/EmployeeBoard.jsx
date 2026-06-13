import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { formatDate, formatDateTime, formatTime12, todayIST } from '../lib/format'
import Clock from '../components/Clock'
import LangToggle from '../components/LangToggle'

export default function EmployeeBoard() {
  const { signOut } = useAuth()
  const { t } = useLang()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchBoard = async () => {
    const { data } = await supabase
      .from('job_board')
      .select('*')
      .order('is_urgent', { ascending: false })
      .order('delivery_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    setJobs(data || [])
    setLoading(false)
  }

  // initial load + live updates
  useEffect(() => {
    fetchBoard()
    const channel = supabase
      .channel('job_board_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_board' }, () => fetchBoard())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const urgentCount = useMemo(() => jobs.filter((j) => j.is_urgent).length, [jobs])
  const today = todayIST()

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Header */}
      <header className="bg-ink text-white px-5 sm:px-8 py-4 flex items-center justify-between gap-4 shadow-md sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-press flex items-center justify-center shrink-0">
            <span className="font-heading font-extrabold text-white text-lg leading-none">IP</span>
          </div>
          <div className="min-w-0">
            <div className="font-heading font-bold text-lg sm:text-xl leading-tight truncate">{t('board.title')}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
          <div className="text-right">
            <div className="font-mono font-bold text-2xl leading-none">{jobs.length}</div>
            <div className="text-[11px] text-ink-200">{t('board.active')}</div>
          </div>
          {urgentCount > 0 && (
            <div className="text-right">
              <div className="font-mono font-bold text-2xl leading-none text-press-light">{urgentCount}</div>
              <div className="text-[11px] text-ink-200">{t('board.urgent')}</div>
            </div>
          )}
          <LangToggle dark />
          <button onClick={signOut}
            className="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors">
            {t('common.signOut')}
          </button>
        </div>
      </header>

      {/* Board */}
      <main className="flex-1 p-4 sm:p-6">
        <div className="flex justify-center mb-5">
          <Clock />
        </div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card"><div className="skeleton h-28 w-full rounded-xl" /></div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24">
            <div className="text-6xl mb-4 opacity-70">✅</div>
            <div className="font-heading font-bold text-2xl text-ink mb-1">{t('board.allCaught')}</div>
            <div className="text-ink-300">{t('board.noActive')}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            <AnimatePresence>
              {jobs.map((j) => (
                <JobCard key={j.id} job={j} today={today} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  )
}

function JobCard({ job, today }) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useLang()

  const jobType = job.job_type === 'Other' ? job.custom_job_type : job.job_type
  const size = job.job_type === 'Flex' && (job.flex_width || job.flex_height)
    ? `${job.flex_width} × ${job.flex_height} ${job.flex_unit}`
    : (job.paper_size === 'Other' ? job.custom_paper_size : job.paper_size)

  // delivery urgency colouring
  const timeSuffix = job.delivery_time ? ` · ${formatTime12(job.delivery_time)}` : ''
  let dueCls = 'text-ink-400'
  let dueLabel = job.delivery_date ? formatDate(job.delivery_date) + timeSuffix : 'No date set'
  if (job.delivery_date) {
    if (job.delivery_date < today) { dueCls = 'text-press font-semibold'; dueLabel = `Overdue · ${formatDate(job.delivery_date)}${timeSuffix}` }
    else if (job.delivery_date === today) { dueCls = 'text-amber_warn font-semibold'; dueLabel = `Today · ${formatDate(job.delivery_date)}${timeSuffix}` }
  }

  const statusCls = {
    'Pending': 'bg-amber_warn/15 text-amber_warn',
    'In Progress': 'bg-ink-100/60 text-ink',
    'Ready for Pickup': 'bg-[#0d9488]/15 text-[#0d9488]'
  }[job.status] || 'bg-ink-50 text-ink-400'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      onClick={() => setExpanded((v) => !v)}
      className={`bg-white rounded-2xl shadow-card overflow-hidden border-l-4 cursor-pointer select-none transition-shadow hover:shadow-cardHover
        ${job.is_urgent ? 'border-press' : 'border-transparent'} ${expanded ? 'ring-2 ring-ink-500/20' : ''}`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="font-mono text-sm text-ink-400">{job.job_id}</div>
          <div className="flex items-center gap-2">
            {job.is_urgent && (
              <span className="pill bg-press text-white animate-pulse">⚡ URGENT</span>
            )}
            <span className={`pill ${statusCls}`}>{t(`status.${job.status}`)}</span>
          </div>
        </div>

        <div className="font-heading font-bold text-xl text-ink leading-tight">{jobType}</div>
        <div className="text-sm text-ink-400 mb-3">
          {size ? <span>{size} · </span> : null}
          <span className="font-mono">{t('field.quantity')} {job.quantity}</span>
        </div>

        {job.assigned_to && (
          <div className="mb-3">
            <span className="pill bg-ink text-white">👤 {job.assigned_to}</span>
          </div>
        )}

        {/* Always-visible quick line */}
        <div className="flex items-center justify-between text-sm border-t border-ink-50 pt-3">
          <span className="text-ink-300">{t('field.delivery')}</span>
          <span className={`text-right ${dueCls}`}>{dueLabel}</span>
        </div>

        {/* Expandable detailed view */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2 text-[15px] bg-paper rounded-xl p-4">
                <DetailRow label={t('field.jobType')} value={jobType} />
                <DetailRow label={t('field.size')} value={size || '—'} />
                <DetailRow label={t('field.quantity')} value={job.quantity} mono />
                <DetailRow label={t('field.customer')} value={job.customer_name || '—'} />
                {job.customer_contact && <DetailRow label={t('field.phone')} value={job.customer_contact} mono />}
                <DetailRow label={t('field.delivery')} value={job.delivery_date ? formatDate(job.delivery_date) + timeSuffix : 'No date set'} valueCls={dueCls} />
                {job.assigned_to && <DetailRow label={t('field.assignedTo')} value={job.assigned_to} />}
                <DetailRow label={t('field.status')} value={t(`status.${job.status}`)} />
                <DetailRow label={t('field.orderTaken')} value={formatDateTime(job.created_at)} />
                {job.notes && (
                  <div className="pt-2 border-t border-ink-100">
                    <div className="text-ink-300 text-sm mb-1">{t('field.notes')}</div>
                    <div className="text-charcoal whitespace-pre-wrap">{job.notes}</div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-3 text-center text-[11px] font-semibold text-ink-300">
          {expanded ? `${t('board.tapCollapse')} ▴` : `${t('board.tapDetails')} ▾`}
        </div>
      </div>
    </motion.div>
  )
}

function DetailRow({ label, value, mono, valueCls = '' }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-ink-300">{label}</span>
      <span className={`text-charcoal font-semibold text-right ${mono ? 'font-mono' : ''} ${valueCls}`}>{value}</span>
    </div>
  )
}
