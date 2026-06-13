import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate, formatDateTime } from '../lib/format'
import StatusBadge from '../components/StatusBadge'
import { Skeleton, SkeletonCard } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'

export default function Customers() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [jobs, setJobs] = useState([])
  const [jobsLoading, setJobsLoading] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('name')
    setCustomers(data || [])
    setLoading(false)
  }

  const openCustomer = async (c) => {
    setSelected(c)
    setJobsLoading(true)
    const { data } = await supabase
      .from('jobs').select('*').eq('customer_id', c.id).is('deleted_at', null).order('created_at', { ascending: false })
    setJobs(data || [])
    setJobsLoading(false)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.contact || '').toLowerCase().includes(q) ||
      (c.place || '').toLowerCase().includes(q))
  }, [customers, query])

  const lastJobDate = jobs.length ? jobs[0].created_at : null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading font-bold text-2xl text-ink">Customers</h1>
        <p className="text-sm text-ink-300">{customers.length} customers · click to view history</p>
      </div>

      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-300">⌕</span>
        <input className="input pl-10" placeholder="Search by name, place or contact…"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filtered.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon="👥" title="No customers found"
              message={query ? 'Try a different search.' : 'Customers are created automatically when you add a job.'} />
          </div>
        ) : (
          filtered.map((c) => (
            <motion.button key={c.id} whileHover={{ y: -2 }}
              onClick={() => openCustomer(c)}
              className="card card-hover text-left">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center font-heading font-bold">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-heading font-semibold text-ink truncate">
                    {c.name}{c.place && <span className="text-press font-normal text-sm"> · {c.place}</span>}
                  </div>
                  <div className="text-xs text-ink-300 font-mono">{c.contact || 'No contact'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[11px] text-ink-300">Spent</div>
                  <div className="font-mono font-semibold text-leaf">{formatINR(c.total_spent)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-ink-300">Pending</div>
                  <div className="font-mono font-semibold text-press">{formatINR(c.total_pending)}</div>
                </div>
              </div>
            </motion.button>
          ))
        )}
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.div className="fixed inset-0 z-50 bg-black/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}>
            <motion.aside
              className="absolute top-0 right-0 h-full w-full max-w-md bg-paper shadow-panel flex flex-col"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="bg-ink text-white px-5 py-4 flex items-start justify-between">
                <div>
                  <div className="font-heading font-bold text-lg leading-tight">{selected.name}</div>
                  {selected.place && <div className="text-[11px] text-ink-100">{selected.place}</div>}
                  <div className="text-[11px] text-ink-200 font-mono">{selected.contact || 'No contact'}</div>
                </div>
                <button onClick={() => setSelected(null)} className="text-xl leading-none text-ink-100 hover:text-white">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="card">
                    <div className="label">Total Spent</div>
                    <div className="font-mono font-bold text-leaf text-xl">{formatINR(selected.total_spent)}</div>
                  </div>
                  <div className="card">
                    <div className="label">Pending Credit</div>
                    <div className="font-mono font-bold text-press text-xl">{formatINR(selected.total_pending)}</div>
                  </div>
                  <div className="card">
                    <div className="label">Total Jobs</div>
                    <div className="font-mono font-bold text-ink text-xl">{jobs.length}</div>
                  </div>
                  <div className="card">
                    <div className="label">Last Job</div>
                    <div className="text-sm font-semibold text-charcoal">{lastJobDate ? formatDate(lastJobDate) : '—'}</div>
                  </div>
                </div>

                <div>
                  <div className="label">Job History</div>
                  {jobsLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                    </div>
                  ) : jobs.length === 0 ? (
                    <div className="text-sm text-ink-300">No jobs yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {jobs.map((j) => (
                        <button key={j.id}
                          onClick={() => navigate(j.order_group ? `/order/${j.order_group}` : `/invoice/${j.id}`)}
                          className="w-full bg-white rounded-xl px-4 py-3 shadow-card flex items-center justify-between text-left hover:shadow-cardHover transition-shadow">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-ink-400">{j.job_id}</span>
                              <StatusBadge status={j.status} />
                            </div>
                            <div className="text-xs text-ink-300 mt-0.5">
                              {(j.job_type === 'Other' ? j.custom_job_type : j.job_type)} · {formatDateTime(j.created_at)}
                            </div>
                          </div>
                          <span className="font-mono text-sm font-semibold text-charcoal shrink-0">{formatINR(j.total_amount)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
