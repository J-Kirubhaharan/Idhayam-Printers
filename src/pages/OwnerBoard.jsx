import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LanguageContext'
import { formatDate, formatDateTime, formatTime12, todayIST } from '../lib/format'
import EmptyState from '../components/EmptyState'
import { Skeleton } from '../components/Skeleton'
import StageBadge from '../components/StageBadge'

// calendar-day key (IST) for grouping by the date the order was taken
const dayKey = (iso) => {
  try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
  catch { return '' }
}

export default function OwnerBoard() {
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

  useEffect(() => {
    fetchBoard()
    const channel = supabase
      .channel('owner_board_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_board' }, () => fetchBoard())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const today = todayIST()
  const urgent = useMemo(() => jobs.filter((j) => j.is_urgent), [jobs])
  // non-urgent jobs grouped by the date they were taken (most recent day first)
  const byDate = useMemo(() => {
    const m = new Map()
    for (const j of jobs) {
      if (j.is_urgent) continue
      const k = dayKey(j.created_at)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(j)
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, list]) => ({ day, list }))
  }, [jobs])

  // list of names already used, for quick re-assigning
  const names = useMemo(
    () => Array.from(new Set(jobs.flatMap((j) => [j.design_assignee, j.print_assignee]).filter(Boolean))),
    [jobs]
  )

  // all updates write to the jobs table; the board syncs automatically
  const updateJob = async (id, patch, msg) => {
    const { error } = await supabase.from('jobs').update(patch).eq('id', id)
    if (error) return toast.error('Could not update job')
    if (msg) toast.success(msg)
    fetchBoard()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-ink">Job Board</h1>
        </div>
      </div>

      <datalist id="assignee-names">
        {names.map((n) => <option key={n} value={n} />)}
      </datalist>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card"><Skeleton className="h-40 w-full" /></div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="card">
          <EmptyState icon="✅" title="No active jobs" message="New jobs appear here and on the employee screens instantly." />
        </div>
      ) : (
        <div className="space-y-8">
          {urgent.length > 0 && (
            <section>
              <SectionHeader title="⚡ Urgent" count={urgent.length} accent />
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <AnimatePresence>
                  {urgent.map((j) => <OwnerJobCard key={j.id} job={j} today={today} onUpdate={updateJob} />)}
                </AnimatePresence>
              </div>
            </section>
          )}
          {byDate.map((g) => (
            <section key={g.day}>
              <SectionHeader title={g.day === today ? 'Today' : formatDate(g.list[0].created_at)} count={g.list.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <AnimatePresence>
                  {g.list.map((j) => <OwnerJobCard key={j.id} job={j} today={today} onUpdate={updateJob} />)}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ title, count, accent }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className={`font-heading font-bold text-lg ${accent ? 'text-press' : 'text-ink'}`}>{title}</h2>
      <span className={`pill ${accent ? 'bg-press text-white' : 'bg-ink-100/70 text-ink'}`}>{count}</span>
      <div className="flex-1 h-px bg-ink-100/70" />
    </div>
  )
}

function OwnerJobCard({ job, today, onUpdate }) {
  const { t } = useLang()
  const [designName, setDesignName] = useState(job.design_assignee || '')
  const [printName, setPrintName] = useState(job.print_assignee || '')
  const [busy, setBusy] = useState(false)

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

  const designDirty = (designName.trim() || '') !== (job.design_assignee || '')
  const printDirty = (printName.trim() || '') !== (job.print_assignee || '')
  const dirty = designDirty || printDirty

  const run = async (fn) => { setBusy(true); await fn(); setBusy(false) }
  const saveNames = () => run(() => onUpdate(job.id, {
    design_assignee: designName.trim() || null,
    print_assignee: printName.trim() || null
  }, 'Assignment updated'))

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
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="font-mono text-sm text-ink-400">{job.job_id}</div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {job.is_urgent && <span className="pill bg-press text-white">⚡ URGENT</span>}
            <span className="pill bg-ink-50 text-ink-400">{job.status}</span>
          </div>
        </div>

        {/* live production stage (Design / Print pipeline) */}
        {job.production_stage && job.production_stage !== 'None' && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-ink-300">{t('board.status')}</span>
            <StageBadge stage={job.production_stage} />
          </div>
        )}

        {job.needs_design && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-ink-300">{t('board.design')}</span>
            {job.design_assignee
              ? <span className="pill bg-press text-white">👤 {job.design_assignee}</span>
              : <span className="pill bg-ink-50 text-ink-400">{t('board.none')}</span>}
          </div>
        )}
        {job.needs_printing && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-ink-300">{t('board.print')}</span>
            {job.print_assignee
              ? <span className="pill bg-ink text-white">👤 {job.print_assignee}</span>
              : <span className="pill bg-ink-50 text-ink-400">{t('board.none')}</span>}
          </div>
        )}

        <div className="font-heading font-bold text-lg text-ink leading-tight">{jobType}</div>
        <div className="text-sm text-ink-400 mb-3">
          {size ? <span>{size} · </span> : null}
          <span className="font-mono">Qty {job.quantity}</span>
        </div>

        <div className="space-y-1.5 text-sm border-t border-ink-50 pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-300">Customer</span>
            <span className="text-charcoal font-medium text-right">{job.customer_name || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-300">Delivery</span>
            <span className={`text-right ${dueCls}`}>{dueLabel}</span>
          </div>
        </div>

        {/* Owner controls */}
        <div className="mt-4 pt-3 border-t border-ink-50 space-y-3">
          {job.needs_design && (
            <div>
              <label className="label">{t('assign.design')}</label>
              <input className="input" list="assignee-names" placeholder={t('assign.namePlaceholder')}
                value={designName} onChange={(e) => setDesignName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveNames() }} />
            </div>
          )}
          {job.needs_printing && (
            <div>
              <label className="label">{t('assign.print')}</label>
              <input className="input" list="assignee-names" placeholder={t('assign.namePlaceholder')}
                value={printName} onChange={(e) => setPrintName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveNames() }} />
            </div>
          )}
          {dirty && (
            <button className="btn-primary w-full" disabled={busy} onClick={saveNames}>{t('assign.save')}</button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              className={`btn text-sm ${job.is_urgent ? 'bg-press text-white' : 'btn-outline'}`}
              disabled={busy}
              onClick={() => run(() => onUpdate(job.id, { is_urgent: !job.is_urgent }, job.is_urgent ? 'Urgent removed' : 'Marked urgent'))}
            >
              {job.is_urgent ? '⚡ Urgent on' : '⚡ Mark urgent'}
            </button>
            <button
              className="btn-outline text-sm"
              disabled={busy}
              onClick={() => run(() => onUpdate(job.id, { status: 'Delivered' }, 'Marked delivered — cleared from board'))}
            >
              ✓ Delivered
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
