import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate } from '../lib/format'
import StatCard from '../components/StatCard'
import { Skeleton, SkeletonCard } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import WhatsAppButton from '../components/WhatsAppButton'
import { buildReminderMessage } from '../lib/whatsapp'

export default function Credit() {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([]) // { customer, jobs[], owed }
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(null) // group being paid
  const [payAmount, setPayAmount] = useState('')
  const [payType, setPayType] = useState('Cash')
  const [busy, setBusy] = useState(false)
  const [confirmPaid, setConfirmPaid] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    // every active job — we keep the ones that still have a balance below
    const { data: jobs } = await supabase
      .from('jobs')
      .select('*, customers(id,name,contact)')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    // sum payments per job to compute balances
    const ids = (jobs || []).map((j) => j.id)
    let paidByJob = {}
    if (ids.length) {
      const { data: pays } = await supabase.from('payments').select('job_id,amount').in('job_id', ids)
      ;(pays || []).forEach((p) => {
        paidByJob[p.job_id] = (paidByJob[p.job_id] || 0) + Number(p.amount)
      })
    }

    const map = new Map()
    ;(jobs || []).forEach((j) => {
      const balance = Math.max(0, Number(j.total_amount) - (Number(j.discount) || 0) - (paidByJob[j.id] || 0))
      if (balance <= 0) return
      const key = j.customers?.id || 'unknown'
      if (!map.has(key)) {
        map.set(key, { customer: j.customers || { name: 'Unknown' }, jobs: [], owed: 0 })
      }
      const g = map.get(key)
      g.jobs.push({ ...j, balance })
      g.owed += balance
    })

    setGroups(Array.from(map.values()).sort((a, b) => b.owed - a.owed))
    setLoading(false)
  }

  const totalOutstanding = useMemo(() => groups.reduce((s, g) => s + g.owed, 0), [groups])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.customer.name.toLowerCase().includes(q))
  }, [groups, query])

  const openCollect = (g) => {
    setActive(g)
    setPayAmount(String(g.owed))
    setPayType('Cash')
  }

  // apply a received amount across the customer's credit jobs, oldest first
  const collect = async () => {
    const amount = Number(payAmount) || 0
    if (amount <= 0) return toast.error('Enter a valid amount')
    if (amount > active.owed + 0.01) return toast.error('Amount exceeds outstanding balance')
    setBusy(true)
    try {
      let remaining = amount
      for (const job of active.jobs) {
        if (remaining <= 0) break
        const applied = Math.min(remaining, job.balance)
        await supabase.from('payments').insert({
          job_id: job.id, amount: applied, payment_type: payType,
          notes: 'Credit collection'
        })
        remaining -= applied
      }
      toast.success(`Collected ${formatINR(amount)} from ${active.customer.name}`)
      setActive(null)
      await load()
    } catch (e) {
      console.error(e)
      toast.error('Could not record payment')
    } finally {
      setBusy(false)
    }
  }

  // mark every credit job for this customer as fully paid
  const markFullyPaid = async (g) => {
    setBusy(true)
    try {
      for (const job of g.jobs) {
        if (job.balance > 0) {
          await supabase.from('payments').insert({
            job_id: job.id, amount: job.balance, payment_type: 'Cash',
            notes: 'Marked fully paid'
          })
        }
      }
      toast.success(`${g.customer.name} marked fully paid`)
      setConfirmPaid(null)
      await load()
    } catch (e) {
      console.error(e)
      toast.error('Could not update')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading font-bold text-2xl text-ink">Credit Management</h1>
        <p className="text-sm text-ink-300">Outstanding dues by customer · collect payments</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? <SkeletonCard /> : (
          <>
            <StatCard label="Total Outstanding" value={formatINR(totalOutstanding)} accent="press" icon="₹" />
            <StatCard label="Customers Owing" value={groups.length} accent="amber" icon="◷" />
          </>
        )}
      </div>

      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-300">⌕</span>
        <input className="input pl-10" placeholder="Search customer…"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)
        ) : filtered.length === 0 ? (
          <EmptyState icon="🎉" title="No pending credit"
            message={query ? 'No match for your search.' : 'All credit jobs are settled.'} />
        ) : (
          filtered.map((g) => (
            <motion.div key={g.customer.id || g.customer.name}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="card flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-ink text-white flex items-center justify-center font-heading font-bold shrink-0">
                    {g.customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-heading font-semibold text-ink">{g.customer.name}</div>
                    <div className="text-xs text-ink-300">
                      {g.jobs.length} unpaid {g.jobs.length === 1 ? 'job' : 'jobs'}
                      {g.customer.contact ? ` · ${g.customer.contact}` : ''}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[11px] text-ink-300">Owed</div>
                  <div className="font-mono font-bold text-press text-lg">{formatINR(g.owed)}</div>
                </div>
                <WhatsAppButton
                  number={g.customer.contact}
                  message={buildReminderMessage(g.customer.name, g.owed)}
                  label="Remind"
                  className="btn bg-[#25D366] text-white hover:bg-[#1faa52] disabled:opacity-50"
                />
                <button className="btn-accent" onClick={() => openCollect(g)}>Collect</button>
                <button className="btn-outline" onClick={() => setConfirmPaid(g)}>Mark paid</button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Collect modal */}
      <AnimatePresence>
        {active && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setActive(null)}>
            <motion.div
              initial={{ scale: 0.95, y: 12, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 12, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              className="bg-white rounded-2xl shadow-cardHover p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}>
              <h3 className="font-heading font-bold text-lg text-ink mb-1">Collect Payment</h3>
              <p className="text-sm text-ink-300 mb-4">
                {active.customer.name} · outstanding <span className="font-mono font-semibold text-press">{formatINR(active.owed)}</span>
              </p>
              <div className="space-y-4">
                <div>
                  <label className="label">Amount received</label>
                  <input type="number" className="input font-mono" value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="label">Payment type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Cash', 'UPI'].map((t) => (
                      <button key={t} type="button" onClick={() => setPayType(t)}
                        className={`btn ${payType === t ? 'bg-ink text-white' : 'btn-outline'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-ink-300">Payment is applied to the oldest unpaid jobs first.</p>
                <div className="flex justify-end gap-2">
                  <button className="btn-outline" onClick={() => setActive(null)} disabled={busy}>Cancel</button>
                  <button className="btn-accent" onClick={collect} disabled={busy}>
                    {busy ? 'Saving…' : 'Record Payment'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!confirmPaid}
        title="Mark fully paid?"
        message={confirmPaid ? `This records the remaining ${formatINR(confirmPaid.owed)} as paid for ${confirmPaid.customer.name} and marks all their credit jobs as Paid.` : ''}
        confirmText="Mark Paid"
        onCancel={() => setConfirmPaid(null)}
        onConfirm={() => markFullyPaid(confirmPaid)}
      />
    </div>
  )
}
