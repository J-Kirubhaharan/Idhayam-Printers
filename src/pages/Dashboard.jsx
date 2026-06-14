import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { formatINR, todayIST, startOfDayISO, endOfDayISO } from '../lib/format'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { SkeletonCard, Skeleton } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import JobDetailPanel from '../components/JobDetailPanel'
import { useLang } from '../context/LanguageContext'

export default function Dashboard() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ income: 0, expenses: 0, profit: 0, pending: 0 })
  const [recent, setRecent] = useState([])
  const [dueToday, setDueToday] = useState([])
  const [ready, setReady] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const today = todayIST()
    const dayStart = startOfDayISO(today)
    const dayEnd = endOfDayISO(today)

    const [paysToday, expToday, pending, recentJobs, dueJobs, readyJobs] = await Promise.all([
      supabase.from('payments').select('amount,payment_type,payment_date')
        .gte('payment_date', dayStart).lte('payment_date', dayEnd),
      supabase.from('expenses').select('amount,created_at')
        .gte('created_at', dayStart).lte('created_at', dayEnd),
      loadPendingCredit(),
      supabase.from('jobs').select('*, customers(name,contact)')
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(10),
      supabase.from('jobs').select('*, customers(name,contact)')
        .is('deleted_at', null).eq('delivery_date', today).in('status', ['Pending', 'In Progress']),
      supabase.from('jobs').select('*, customers(name,contact,alt_contact)')
        .is('deleted_at', null).eq('status', 'Ready for Pickup')
        .order('delivery_date', { ascending: true, nullsFirst: false })
    ])

    const income = (paysToday.data || []).reduce((s, p) => s + Number(p.amount), 0)
    const expenses = (expToday.data || []).reduce((s, e) => s + Number(e.amount), 0)

    setStats({ income, expenses, profit: income - expenses, pending })
    setRecent(recentJobs.data || [])
    setDueToday(dueJobs.data || [])
    setReady(readyJobs.data || [])
    setLoading(false)
  }

  // remaining balance across all jobs = total - discount - payments already made
  const loadPendingCredit = async () => {
    const { data: jobs } = await supabase.from('jobs').select('id,total_amount,discount').is('deleted_at', null)
    if (!jobs?.length) return 0
    const ids = jobs.map((j) => j.id)
    const { data: pays } = await supabase.from('payments').select('job_id,amount').in('job_id', ids)
    const paidByJob = {}
    ;(pays || []).forEach((p) => { paidByJob[p.job_id] = (paidByJob[p.job_id] || 0) + Number(p.amount) })
    return jobs.reduce((s, j) => s + Math.max(0, Number(j.total_amount) - (Number(j.discount) || 0) - (paidByJob[j.id] || 0)), 0)
  }

  const actions = [
    { label: t('action.newJob'), sub: t('action.newJobSub'), to: '/new-job', cls: 'bg-press hover:bg-press-dark', icon: '+' },
    { label: t('action.existingJobs'), sub: t('action.existingJobsSub'), to: '/jobs', cls: 'bg-ink hover:bg-ink-600', icon: '☰' },
    { label: t('action.addExpense'), sub: t('action.addExpenseSub'), to: '/expenses', cls: 'bg-leaf hover:opacity-90', icon: '−' },
    { label: t('action.collectPayment'), sub: t('action.collectPaymentSub'), to: '/credit', cls: 'bg-amber_warn hover:opacity-90', icon: '₹' }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-heading font-bold text-2xl text-ink">{t('dashboard.title')}</h1>
          <p className="text-sm text-ink-300">{t('dashboard.subtitle')}</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label={t('stat.todayIncome')} value={formatINR(stats.income)} accent="leaf" icon="₹" />
            <StatCard label={t('stat.todayExpenses')} value={formatINR(stats.expenses)} accent="press" icon="−" />
            <StatCard label={t('stat.todayProfit')} value={formatINR(stats.profit)} accent={stats.profit >= 0 ? 'ink' : 'press'} icon="▲" />
            <StatCard label={t('stat.pendingCredits')} value={formatINR(stats.pending)} accent="amber" icon="◷" />
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {actions.map((a) => (
          <motion.button key={a.to} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
            onClick={() => navigate(a.to)}
            className={`${a.cls} text-white rounded-2xl p-5 text-left shadow-card transition-all`}>
            <div className="text-2xl mb-2 font-bold opacity-90">{a.icon}</div>
            <div className="font-heading font-semibold text-lg leading-tight">{a.label}</div>
            <div className="text-xs text-white/80">{a.sub}</div>
          </motion.button>
        ))}
      </div>

      {/* Due today alert */}
      {!loading && dueToday.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-press/40 bg-press/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-press text-lg">⚠</span>
            <h3 className="font-heading font-bold text-press">{t('dashboard.dueToday')} ({dueToday.length})</h3>
          </div>
          <div className="space-y-2">
            {dueToday.map((j) => (
              <div key={j.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 shadow-card">
                <div className="min-w-0">
                  <span className="font-mono text-sm text-ink">{j.job_id}</span>
                  <span className="mx-2 text-ink-200">·</span>
                  <span className="text-sm font-medium text-charcoal">{j.customers?.name || '—'}</span>
                </div>
                <StatusBadge status={j.status} />
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent jobs */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-bold text-ink">{t('dashboard.recentJobs')}</h3>
            <button className="text-xs font-semibold text-press hover:underline" onClick={() => navigate('/jobs')}>{t('common.viewAll')} →</button>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : recent.length === 0 ? (
            <EmptyState icon="🗂️" title={t('dashboard.noJobsTitle')} message={t('dashboard.noJobsMsg')}
              action={<button className="btn-accent" onClick={() => navigate('/new-job')}>{t('action.newJob')}</button>} />
          ) : (
            <div className="divide-y divide-ink-50">
              {recent.map((j) => (
                <button key={j.id} onClick={() => setSelected(j)}
                  className="w-full flex items-center justify-between py-2.5 text-left hover:bg-ink-50/40 -mx-2 px-2 rounded-lg transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink-400">{j.job_id}</span>
                      <span className="text-sm font-medium text-charcoal truncate">{j.customers?.name || '—'}</span>
                    </div>
                    <div className="text-xs text-ink-300">{j.job_type === 'Other' ? j.custom_job_type : j.job_type}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-sm text-charcoal">{formatINR(j.total_amount)}</span>
                    <StatusBadge status={j.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ready for pickup — finished, waiting for the customer to collect */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">📦</span>
            <h3 className="font-heading font-bold text-ink">{t('dashboard.readyForPickup')}</h3>
            {!loading && ready.length > 0 && (
              <span className="pill bg-[#0d9488]/15 text-[#0d9488]">{ready.length}</span>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : ready.length === 0 ? (
            <EmptyState icon="✅" title={t('dashboard.nothingWaitingTitle')} message={t('dashboard.nothingWaitingMsg')} />
          ) : (
            <div className="divide-y divide-ink-50">
              {ready.map((j) => (
                <div key={j.id}
                  className="flex items-center justify-between py-2.5 -mx-2 px-2 rounded-lg hover:bg-ink-50/40 transition-colors cursor-pointer"
                  onClick={() => setSelected(j)}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink-400">{j.job_id}</span>
                      <span className="text-sm font-medium text-charcoal truncate">{j.customers?.name || '—'}</span>
                    </div>
                    <div className="text-xs text-ink-300">{j.job_type === 'Other' ? j.custom_job_type : j.job_type} · Qty {j.quantity}</div>
                  </div>
                  {j.customers?.contact ? (
                    <a href={`tel:${j.customers.contact}`} onClick={(e) => e.stopPropagation()}
                      className="font-mono text-sm font-semibold text-[#0d9488] hover:underline shrink-0">
                      📞 {j.customers.contact}
                    </a>
                  ) : (
                    <span className="text-xs text-ink-300 shrink-0">No number</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <JobDetailPanel
          job={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
          onDuplicate={(job) => { setSelected(null); navigate('/new-job', { state: { duplicate: job } }) }}
        />
      )}
    </div>
  )
}
