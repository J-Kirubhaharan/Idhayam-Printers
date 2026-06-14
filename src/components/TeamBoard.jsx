import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { formatDate, formatDateTime, formatTime12, todayIST } from '../lib/format'
import Clock from './Clock'
import LangToggle from './LangToggle'
import BoardNotifications from './BoardNotifications'

// team config: which stages this team works on, and the button for each stage
const CONFIG = {
  design: {
    titleKey: 'board.designTitle',
    accent: 'bg-press',
    // design finish hands straight to the print queue (no resting stage)
    stages: ['Design Queue', 'Designing'],
    button: {
      'Design Queue': { action: 'start_design', cls: 'bg-ink hover:bg-ink-600' },
      'Designing': { action: 'finish_design', cls: 'bg-leaf hover:opacity-90' }
    }
  },
  print: {
    titleKey: 'board.printTitle',
    accent: 'bg-ink',
    // print finish completes the job immediately (no resting stage)
    stages: ['Print Queue', 'Printing'],
    button: {
      'Print Queue': { action: 'start_print', cls: 'bg-ink hover:bg-ink-600' },
      'Printing': { action: 'finish_print', cls: 'bg-leaf hover:opacity-90' }
    }
  }
}

const STAGE_PILL = {
  'Design Queue': 'bg-amber_warn/15 text-amber_warn',
  'Designing': 'bg-press/15 text-press',
  'Design finished': 'bg-leaf/15 text-leaf',
  'Print Queue': 'bg-amber_warn/15 text-amber_warn',
  'Printing': 'bg-ink-100/60 text-ink',
  'Print finished': 'bg-leaf/15 text-leaf'
}

// calendar-day key (IST) for grouping by the date the order was taken
const dayKey = (iso) => {
  try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
  catch { return '' }
}
// group jobs by date taken, most recent day first
const groupByDate = (list) => {
  const m = new Map()
  for (const j of list) {
    const k = dayKey(j.created_at)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(j)
  }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, items]) => ({ day, list: items }))
}

export default function TeamBoard({ team }) {
  const cfg = CONFIG[team]
  const { signOut } = useAuth()
  const { t } = useLang()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [prompt, setPrompt] = useState(null)   // { job, action } when a Start needs the worker name
  const [enterMode, setEnterMode] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [urgentDates, setUrgentDates] = useState(false)  // group the Urgent section by date?

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

  const teamAssignee = (job) => team === 'design' ? job.design_assignee : job.print_assignee

  const advance = async (job) => {
    const btn = cfg.button[job.production_stage]
    if (!btn) return
    // a Start asks who's working first; a Finish just advances
    if (btn.action.startsWith('start')) {
      const existing = teamAssignee(job) || ''
      setPrompt({ job, action: btn.action })
      setEnterMode(!existing)          // no name yet -> ask "who is working"; else "are you X?"
      setNameInput(existing)
      return
    }
    doAdvance(job, btn.action, null)
  }

  // run the stage change, optionally recording the worker's name
  const doAdvance = async (job, action, worker) => {
    setPrompt(null)
    setBusyId(job.id)
    const { error } = await supabase.rpc('advance_production', {
      p_job: job.id, p_action: action, p_worker: worker ?? null
    })
    setBusyId(null)
    if (error) { toast.error('Could not update. Try again.'); return }
    toast.success(action.startsWith('finish') ? 'Marked finished' : 'Work started')
    fetchBoard()
  }

  const today = todayIST()
  const urgent = useMemo(() => jobs.filter((j) => j.is_urgent), [jobs])
  const urgentCount = urgent.length
  const urgentByDate = useMemo(() => groupByDate(jobs.filter((j) => j.is_urgent)), [jobs])
  const byDate = useMemo(() => groupByDate(jobs.filter((j) => !j.is_urgent)), [jobs])

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="bg-ink text-white px-5 sm:px-8 py-4 flex items-center justify-between gap-4 shadow-md sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-xl ${cfg.accent} flex items-center justify-center shrink-0`}>
            <span className="font-heading font-extrabold text-white text-lg leading-none">IP</span>
          </div>
          <div className="min-w-0">
            <div className="font-heading font-bold text-lg sm:text-xl leading-tight truncate">{t(cfg.titleKey)}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
          <div className="text-right">
            <div className="font-mono font-bold text-2xl leading-none">{jobs.length}</div>
            <div className="text-[11px] text-ink-200">{t('board.jobs')}</div>
          </div>
          {urgentCount > 0 && (
            <div className="text-right">
              <div className="font-mono font-bold text-2xl leading-none text-press-light">{urgentCount}</div>
              <div className="text-[11px] text-ink-200">{t('board.urgent')}</div>
            </div>
          )}
          <BoardNotifications role={team} />
          <LangToggle dark />
          <button onClick={signOut}
            className="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors">
            {t('common.signOut')}
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
            <div className="font-heading font-bold text-2xl text-ink mb-1">{t('board.nothingPending')}</div>
            <div className="text-ink-300">{t('board.workAppears')}</div>
          </div>
        ) : (
          <div className="space-y-8">
            {urgent.length > 0 && (
              <section>
                <SectionHeader title={`⚡ ${t('board.urgent')}`} count={urgent.length} accent
                  right={<DateToggle on={urgentDates} onClick={() => setUrgentDates((v) => !v)} label={t('board.byDate')} />} />
                {urgentDates ? (
                  <div className="space-y-5">
                    {urgentByDate.map((g) => (
                      <div key={g.day}>
                        <DateSubHeader label={g.day === today ? t('board.today') : formatDate(g.list[0].created_at)} count={g.list.length} />
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                          <AnimatePresence>
                            {g.list.map((j) => <Card key={j.id} job={j} today={today} cfg={cfg} team={team} busy={busyId === j.id} onAdvance={() => advance(j)} />)}
                          </AnimatePresence>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                    <AnimatePresence>
                      {urgent.map((j) => <Card key={j.id} job={j} today={today} cfg={cfg} team={team} busy={busyId === j.id} onAdvance={() => advance(j)} />)}
                    </AnimatePresence>
                  </div>
                )}
              </section>
            )}
            {byDate.map((g) => (
              <section key={g.day}>
                <SectionHeader title={g.day === today ? t('board.today') : formatDate(g.list[0].created_at)} count={g.list.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                  <AnimatePresence>
                    {g.list.map((j) => <Card key={j.id} job={j} today={today} cfg={cfg} team={team} busy={busyId === j.id} onAdvance={() => advance(j)} />)}
                  </AnimatePresence>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Who's working? prompt shown when a team member taps Start */}
      <AnimatePresence>
        {prompt && (
          <motion.div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPrompt(null)}>
            <motion.div
              className="bg-paper w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-panel overflow-hidden"
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="bg-ink text-white px-5 py-4">
                <div className="font-mono text-xs text-ink-100">{prompt.job.job_id}</div>
                <div className="font-heading font-bold text-lg leading-tight">
                  {enterMode
                    ? t('start.whoWorking')
                    : `${t('start.areYouPre')} ${teamAssignee(prompt.job)}${t('start.areYouPost')}`}
                </div>
              </div>
              <div className="p-5 space-y-2.5">
                {!enterMode ? (
                  <>
                    <button onClick={() => doAdvance(prompt.job, prompt.action, null)}
                      className="w-full py-3 rounded-xl bg-leaf text-white font-bold text-sm">{t('start.yes')}</button>
                    <button onClick={() => { setEnterMode(true); setNameInput('') }}
                      className="w-full py-3 rounded-xl bg-white border border-ink-100 text-charcoal font-semibold text-sm hover:bg-ink-50">{t('start.no')}</button>
                    <button onClick={() => doAdvance(prompt.job, prompt.action, null)}
                      className="w-full py-2 text-ink-300 hover:text-ink font-semibold text-sm">{t('start.noNeed')}</button>
                  </>
                ) : (
                  <>
                    <input autoFocus className="input" placeholder={t('start.enterName')}
                      value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && nameInput.trim()) doAdvance(prompt.job, prompt.action, nameInput.trim()) }} />
                    <button onClick={() => doAdvance(prompt.job, prompt.action, nameInput.trim())}
                      disabled={!nameInput.trim()}
                      className="w-full py-3 rounded-xl bg-leaf text-white font-bold text-sm disabled:opacity-50">{t('start.startWithName')}</button>
                    <button onClick={() => doAdvance(prompt.job, prompt.action, null)}
                      className="w-full py-2 text-ink-300 hover:text-ink font-semibold text-sm">{t('start.noNeed')}</button>
                  </>
                )}
                <button onClick={() => setPrompt(null)}
                  className="w-full py-2 text-ink-300 hover:text-ink text-xs">{t('start.cancel')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DateSubHeader({ label, count }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-sm font-semibold text-ink-400">{label}</span>
      <span className="text-xs text-ink-300">· {count}</span>
    </div>
  )
}

function DateToggle({ on, onClick, label }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-ink-100 hover:bg-ink-50'}`}>
      📅 {label}{on ? ' ✓' : ''}
    </button>
  )
}

function SectionHeader({ title, count, accent, right }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className={`font-heading font-bold text-lg ${accent ? 'text-press' : 'text-ink'}`}>{title}</h2>
      <span className={`pill ${accent ? 'bg-press text-white' : 'bg-ink-100/70 text-ink'}`}>{count}</span>
      <div className="flex-1 h-px bg-ink-100/70" />
      {right}
    </div>
  )
}

function Card({ job, today, cfg, team, busy, onAdvance }) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useLang()
  const worker = team === 'design' ? job.design_assignee : job.print_assignee

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
      className={`bg-white rounded-2xl shadow-card overflow-hidden border-l-4 transition-shadow hover:shadow-cardHover
        ${job.is_urgent ? 'border-press' : 'border-transparent'} ${expanded ? 'ring-2 ring-ink-500/20' : ''}`}
    >
      <div className="p-5">
        {/* Tappable summary area */}
        <div className="cursor-pointer select-none" onClick={() => setExpanded((v) => !v)}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="font-mono text-sm text-ink-400">{job.job_id}</div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {job.is_urgent && <span className="pill bg-press text-white animate-pulse">⚡ URGENT</span>}
              <span className={`pill ${STAGE_PILL[job.production_stage] || 'bg-ink-50 text-ink-400'}`}>{t(`pstage.${job.production_stage}`)}</span>
            </div>
          </div>

          {/* Assigned worker for this team — highlighted at the top */}
          {worker && (
            <div className="mb-2"><span className="pill bg-ink text-white text-sm">👤 {worker}</span></div>
          )}

          <div className="font-heading font-bold text-xl text-ink leading-tight">{jobType}</div>
          <div className="text-sm text-ink-400 mb-3">
            {size ? <span>{size} · </span> : null}
            <span className="font-mono">{t('field.quantity')} {job.quantity}</span>
          </div>

          {/* Always-visible quick line */}
          <div className="flex items-center justify-between text-sm border-t border-ink-50 pt-3">
            <span className="text-ink-300">{t('field.delivery')}</span>
            <span className={`text-right ${dueCls}`}>{dueLabel}</span>
          </div>

          {/* Expandable detail */}
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
                  {worker && <DetailRow label={t('field.assignedTo')} value={worker} />}
                  <DetailRow label={t('field.status')} value={t(`pstage.${job.production_stage}`)} />
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

        {/* Action button (doesn't toggle the card) */}
        {btn && (
          <button onClick={(e) => { e.stopPropagation(); onAdvance() }} disabled={busy}
            className={`${btn.cls} w-full text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 mt-4`}>
            {busy ? 'Saving…' : btn.action.startsWith('start') ? t('common.start') : t('common.finish')}
          </button>
        )}
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
