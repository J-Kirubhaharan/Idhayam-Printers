import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate } from '../lib/format'
import StatusBadge from './StatusBadge'
import JobDetailPanel from './JobDetailPanel'

const billNoOf = (jobId) => {
  const p = (jobId || '').split('-')
  return p.length > 3 ? p.slice(0, 3).join('-') : (jobId || '')
}

// Global quick search: jump to any order by bill no, customer name, phone or place.
export default function GlobalSearch() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const inputRef = useRef(null)

  const fetchRows = async () => {
    const { data } = await supabase
      .from('jobs')
      .select('id, job_id, order_group, total_amount, status, created_at, job_type, custom_job_type, is_urgent, customers(name,contact,alt_contact,place)')
      .is('deleted_at', null)
    setRows(data || [])
    setLoaded(true)
  }

  // open/close + keyboard shortcuts ( / or Ctrl/Cmd+K to open, Esc to close )
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      const typing = ['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K'))) {
        e.preventDefault(); setOpen(true)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      fetchRows()  // refresh each open so newly-created orders show up
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQ('')
    }
  }, [open]) // eslint-disable-line

  // one entry per order (collapse multi-item orders)
  const orders = useMemo(() => {
    const seen = new Map()
    for (const j of rows) {
      const key = j.order_group || j.id
      if (!seen.has(key)) {
        seen.set(key, {
          key, id: j.id, order_group: j.order_group,
          billNo: billNoOf(j.job_id),
          customer: j.customers,
          type: j.job_type === 'Other' ? j.custom_job_type : j.job_type,
          amount: Number(j.total_amount) || 0,
          status: j.status, date: j.created_at, urgent: j.is_urgent
        })
      } else {
        const o = seen.get(key)
        o.amount += Number(j.total_amount) || 0
      }
    }
    return [...seen.values()]
  }, [rows])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return orders.slice(0, 8)  // recent-ish (unsorted) prompt
    return orders.filter((o) => {
      const hay = [o.billNo, o.customer?.name, o.customer?.contact, o.customer?.alt_contact, o.customer?.place, o.type]
        .join(' ').toLowerCase()
      return hay.includes(s)
    }).slice(0, 12)
  }, [orders, q])

  // open the slide-in detail/edit panel for the order's job
  const go = async (o) => {
    setOpen(false)
    const { data } = await supabase
      .from('jobs').select('*, customers(name,contact,alt_contact,place)')
      .eq('id', o.id).is('deleted_at', null).maybeSingle()
    if (data) setSelectedJob(data)
    else toast('That order is no longer available.')
  }

  const refreshSelected = async () => {
    if (!selectedJob) return
    const { data } = await supabase
      .from('jobs').select('*, customers(name,contact,alt_contact,place)')
      .eq('id', selectedJob.id).is('deleted_at', null).maybeSingle()
    setSelectedJob(data || null)
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Search (press /)"
        className="w-10 h-10 rounded-xl bg-white border border-ink-100 shadow-card flex items-center justify-center hover:bg-ink-50 transition-colors">
        <svg className="w-5 h-5 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div className="fixed inset-0 z-[90] bg-black/40 flex items-start justify-center pt-[12vh] px-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}>
              <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.98 }}
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                className="w-full max-w-lg bg-paper rounded-2xl shadow-panel overflow-hidden"
                onClick={(e) => e.stopPropagation()}>
                {/* Search field */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-50">
                  <svg className="w-5 h-5 text-ink-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                  </svg>
                  <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Search bill no, name, phone or place…"
                    className="flex-1 bg-transparent outline-none text-charcoal placeholder:text-ink-300" />
                  <kbd className="text-[10px] text-ink-300 border border-ink-100 rounded px-1.5 py-0.5">Esc</kbd>
                </div>

                {/* Results */}
                <div className="max-h-[55vh] overflow-y-auto p-2">
                  {!loaded ? (
                    <div className="px-3 py-6 text-center text-sm text-ink-300">Loading…</div>
                  ) : results.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-ink-300">
                      {q ? `No orders match “${q}”` : 'No orders yet.'}
                    </div>
                  ) : (
                    <>
                      {!q && <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-ink-300">Recent orders</div>}
                      {results.map((o) => (
                        <button key={o.key} onClick={() => go(o)}
                          className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-ink-50 flex items-center gap-3 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-ink-400">{o.urgent ? '⚡ ' : ''}{o.billNo}</span>
                              <StatusBadge status={o.status} />
                            </div>
                            <div className="text-sm font-medium text-charcoal truncate">
                              {o.customer?.name || '—'}
                              {o.customer?.place && <span className="text-press font-normal"> · {o.customer.place}</span>}
                              <span className="text-ink-300 font-normal"> · {o.type}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono text-sm text-charcoal">{formatINR(o.amount)}</div>
                            <div className="text-[11px] text-ink-300">{formatDate(o.date)}</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onChanged={refreshSelected}
          onDuplicate={(job) => { setSelectedJob(null); navigate('/new-job', { state: { duplicate: job } }) }}
        />
      )}
    </>
  )
}
