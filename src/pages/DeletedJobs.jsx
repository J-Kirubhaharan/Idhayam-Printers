import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate, formatDateTime } from '../lib/format'
import { PaymentBadge } from '../components/StatusBadge'
import { SkeletonRow } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'

export default function DeletedJobs() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState([])
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('*, customers(name,contact)')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    setJobs(data || [])
    setLoading(false)
  }

  const restore = async (job) => {
    setBusyId(job.id)
    const { error } = await supabase.from('jobs').update({ deleted_at: null }).eq('id', job.id)
    setBusyId(null)
    if (error) return toast.error('Could not restore job')
    toast.success(`${job.job_id} restored`)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-ink">Deleted Jobs</h1>
          <p className="text-sm text-ink-300">
            {jobs.length} deleted · their Job IDs stay retired and are never reused
          </p>
        </div>
        <button className="btn-outline" onClick={() => navigate('/jobs')}>← Back to Jobs</button>
      </div>

      <div className="rounded-2xl border border-ink-100 bg-ink-50/40 px-4 py-3 text-sm text-ink-400">
        Restoring a job brings it back to Existing Jobs. Note: payments that were on the job
        at deletion are not restored — re-enter them from the job's Payment tab if needed.
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50/60 text-ink-400 text-xs uppercase tracking-wide">
                <th className="text-left font-semibold px-4 py-3">Job ID</th>
                <th className="text-left font-semibold px-4 py-3">Customer</th>
                <th className="text-left font-semibold px-4 py-3">Type</th>
                <th className="text-right font-semibold px-4 py-3">Amount</th>
                <th className="text-left font-semibold px-4 py-3">Method</th>
                <th className="text-left font-semibold px-4 py-3">Created</th>
                <th className="text-left font-semibold px-4 py-3">Deleted</th>
                <th className="text-right font-semibold px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState icon="🗑️" title="No deleted jobs" message="Jobs you delete will appear here, where you can restore them." />
                  </td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-ink-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-ink-400 whitespace-nowrap">{j.job_id}</td>
                    <td className="px-4 py-3 font-medium text-charcoal">{j.customers?.name || '—'}</td>
                    <td className="px-4 py-3 text-ink-400">{j.job_type === 'Other' ? j.custom_job_type : j.job_type}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatINR(j.total_amount)}</td>
                    <td className="px-4 py-3"><PaymentBadge type={j.payment_type} /></td>
                    <td className="px-4 py-3 text-ink-400 whitespace-nowrap">{formatDate(j.created_at)}</td>
                    <td className="px-4 py-3 text-ink-400 whitespace-nowrap">{formatDateTime(j.deleted_at)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        className="text-xs font-semibold text-leaf hover:underline disabled:opacity-50"
                        disabled={busyId === j.id}
                        onClick={() => restore(j)}
                      >
                        {busyId === j.id ? 'Restoring…' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
