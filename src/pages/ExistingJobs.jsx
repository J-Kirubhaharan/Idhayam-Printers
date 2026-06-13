import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate, paymentStatusOf } from '../lib/format'
import StatusBadge, { PaymentBadge, PaymentStatusBadge } from '../components/StatusBadge'
import { SkeletonRow } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import JobDetailPanel from '../components/JobDetailPanel'
import { useLang } from '../context/LanguageContext'

// translate a filter chip label
const filterLabel = (t, f, kind) =>
  f === 'All' ? t('common.all') : t(`${kind}.${f}`)

const DELIVERY_FILTERS = ['All', 'Pending', 'In Progress']
const PAYMENT_FILTERS = ['All', 'Paid', 'Partial', 'Pending']

export default function ExistingJobs() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState([])
  const [paidByJob, setPaidByJob] = useState({})
  const [query, setQuery] = useState('')
  const [delivery, setDelivery] = useState('All')
  const [payment, setPayment] = useState('All')
  const [selected, setSelected] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: jobsData }, { data: pays }] = await Promise.all([
      supabase.from('jobs').select('*, customers(name,contact,alt_contact)').is('deleted_at', null).in('status', ['Pending', 'In Progress']).order('created_at', { ascending: false }),
      supabase.from('payments').select('job_id,amount')
    ])
    const paid = {}
    ;(pays || []).forEach((p) => { paid[p.job_id] = (paid[p.job_id] || 0) + Number(p.amount) })
    setPaidByJob(paid)
    setJobs(jobsData || [])
    setLoading(false)
  }

  // re-sync the open panel with fresh data after a change
  const refreshKeepingSelection = async () => {
    const id = selected?.id
    await load()
    if (id) {
      const { data } = await supabase
        .from('jobs').select('*, customers(name,contact,alt_contact)').eq('id', id).is('deleted_at', null).maybeSingle()
      setSelected(data || null)
    }
  }

  const payStatusOf = (j) => paymentStatusOf(j, paidByJob[j.id] || 0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return jobs.filter((j) => {
      if (delivery !== 'All' && j.status !== delivery) return false
      if (payment !== 'All' && payStatusOf(j) !== payment) return false
      if (!q) return true
      const hay = [
        j.job_id,
        j.customers?.name,
        j.job_type === 'Other' ? j.custom_job_type : j.job_type,
        formatDate(j.created_at)
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [jobs, query, delivery, payment, paidByJob])

  const duplicate = (job) => {
    setSelected(null)
    navigate('/new-job', { state: { duplicate: job } })
  }

  const deliveryCounts = useMemo(() => {
    const c = { All: jobs.length }
    DELIVERY_FILTERS.slice(1).forEach((f) => { c[f] = jobs.filter((j) => j.status === f).length })
    return c
  }, [jobs])

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-ink">{t('jobs.title')}</h1>
          <p className="text-sm text-ink-300">{jobs.length} {t('jobs.active')} · {t('jobs.finishedMove')}</p>
        </div>
        <button className="btn-accent" onClick={() => navigate('/new-job')}>+ {t('action.newJob')}</button>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-300">⌕</span>
        <input
          className="input pl-10"
          placeholder={t('jobs.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 w-16">{t('jobs.deliveryLabel')}</span>
          {DELIVERY_FILTERS.map((f) => (
            <button key={f} onClick={() => setDelivery(f)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors
                ${delivery === f ? 'bg-ink text-white' : 'bg-white text-ink-300 border border-ink-100 hover:bg-ink-50'}`}>
              {filterLabel(t, f, 'status')} <span className="opacity-70">{deliveryCounts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 w-16">{t('jobs.paymentLabel')}</span>
          {PAYMENT_FILTERS.map((f) => (
            <button key={f} onClick={() => setPayment(f)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors
                ${payment === f ? 'bg-press text-white' : 'bg-white text-ink-300 border border-ink-100 hover:bg-ink-50'}`}>
              {filterLabel(t, f, 'paystatus')}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50/60 text-ink-400 text-xs uppercase tracking-wide">
                <th className="text-left font-semibold px-4 py-3">{t('col.jobId')}</th>
                <th className="text-left font-semibold px-4 py-3">{t('field.customer')}</th>
                <th className="text-left font-semibold px-4 py-3">{t('col.type')}</th>
                <th className="text-right font-semibold px-4 py-3">{t('col.amount')}</th>
                <th className="text-left font-semibold px-4 py-3">{t('col.method')}</th>
                <th className="text-left font-semibold px-4 py-3">{t('jobs.paymentLabel')}</th>
                <th className="text-left font-semibold px-4 py-3">{t('jobs.deliveryLabel')}</th>
                <th className="text-left font-semibold px-4 py-3">{t('col.date')}</th>
                <th className="text-right font-semibold px-4 py-3">{t('col.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={9} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState icon="🔍" title={t('jobs.noneFound')}
                      message={query || delivery !== 'All' || payment !== 'All' ? t('jobs.tryDifferent') : t('jobs.createFirst')}
                      action={!query && delivery === 'All' && payment === 'All' && <button className="btn-accent" onClick={() => navigate('/new-job')}>{t('action.newJob')}</button>} />
                  </td>
                </tr>
              ) : (
                filtered.map((j) => (
                  <tr key={j.id} className="table-row-hover" onClick={() => setSelected(j)}>
                    <td className="px-4 py-3 font-mono text-xs text-ink-400 whitespace-nowrap">
                      {j.is_urgent && <span className="mr-1.5" title="Urgent">⚡</span>}{j.job_id}
                    </td>
                    <td className="px-4 py-3 font-medium text-charcoal">{j.customers?.name || '—'}</td>
                    <td className="px-4 py-3 text-ink-400">{j.job_type === 'Other' ? j.custom_job_type : j.job_type}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatINR(j.total_amount)}</td>
                    <td className="px-4 py-3"><PaymentBadge type={j.payment_type} /></td>
                    <td className="px-4 py-3"><PaymentStatusBadge status={payStatusOf(j)} /></td>
                    <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                    <td className="px-4 py-3 text-ink-400 whitespace-nowrap">{formatDate(j.created_at)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button className="text-xs font-semibold text-press hover:underline mr-3"
                        onClick={() => navigate(j.order_group ? `/order/${j.order_group}` : `/invoice/${j.id}`)}>{t('jobs.invoice')}</button>
                      <button className="text-xs font-semibold text-ink hover:underline"
                        onClick={() => duplicate(j)}>{t('jobs.duplicate')}</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <JobDetailPanel
          job={selected}
          onClose={() => setSelected(null)}
          onChanged={refreshKeepingSelection}
          onDuplicate={duplicate}
        />
      )}
    </div>
  )
}
