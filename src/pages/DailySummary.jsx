import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate, todayIST, startOfDayISO, endOfDayISO } from '../lib/format'
import { Skeleton } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'

export default function DailySummary() {
  const [date, setDate] = useState(todayIST())
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState([])

  useEffect(() => { compute(date) }, [date])
  useEffect(() => { loadHistory() }, [])

  const compute = async (d) => {
    setLoading(true)
    const start = startOfDayISO(d)
    const end = endOfDayISO(d)

    const [{ data: pays }, { data: exps }, { data: creditJobs }] = await Promise.all([
      supabase.from('payments').select('amount,payment_type,payment_date')
        .gte('payment_date', start).lte('payment_date', end),
      supabase.from('expenses').select('amount,created_at')
        .gte('created_at', start).lte('created_at', end),
      supabase.from('jobs').select('id,total_amount,discount,created_at,payment_type')
        .eq('payment_type', 'Credit').is('deleted_at', null).gte('created_at', start).lte('created_at', end)
    ])

    const total_cash = (pays || []).filter((p) => p.payment_type === 'Cash').reduce((s, p) => s + Number(p.amount), 0)
    const total_upi = (pays || []).filter((p) => p.payment_type === 'UPI').reduce((s, p) => s + Number(p.amount), 0)

    // credit given today = total of today's credit jobs minus any advance paid on them today
    const creditIds = (creditJobs || []).map((j) => j.id)
    let advanceByJob = {}
    if (creditIds.length) {
      const { data: advPays } = await supabase.from('payments')
        .select('job_id,amount').in('job_id', creditIds)
        .gte('payment_date', start).lte('payment_date', end)
      ;(advPays || []).forEach((p) => { advanceByJob[p.job_id] = (advanceByJob[p.job_id] || 0) + Number(p.amount) })
    }
    const total_credit = (creditJobs || []).reduce(
      (s, j) => s + Math.max(0, Number(j.total_amount) - (Number(j.discount) || 0) - (advanceByJob[j.id] || 0)), 0)
    const total_expenses = (exps || []).reduce((s, e) => s + Number(e.amount), 0)
    const total_income = total_cash + total_upi
    const net_profit = total_income - total_expenses

    setSummary({ total_cash, total_upi, total_credit, total_income, total_expenses, net_profit })
    setLoading(false)
  }

  const loadHistory = async () => {
    const { data } = await supabase.from('daily_summary').select('*').order('date', { ascending: false }).limit(30)
    setHistory(data || [])
  }

  const save = async () => {
    if (!summary) return
    setSaving(true)
    const { error } = await supabase.from('daily_summary').upsert({
      date,
      ...summary
    }, { onConflict: 'date' })
    setSaving(false)
    if (error) return toast.error('Could not save summary')
    toast.success(`Summary for ${formatDate(date)} saved`)
    loadHistory()
  }

  const rows = summary ? [
    { label: 'Total Cash', value: summary.total_cash, accent: 'text-leaf' },
    { label: 'Total UPI', value: summary.total_upi, accent: 'text-ink' },
    { label: 'Total Credit Given', value: summary.total_credit, accent: 'text-amber_warn' },
    { label: 'Total Income (Cash + UPI)', value: summary.total_income, accent: 'text-leaf', bold: true },
    { label: 'Total Expenses', value: summary.total_expenses, accent: 'text-press' }
  ] : []

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-ink">Daily Cash Summary</h1>
          <p className="text-sm text-ink-300">End-of-day breakdown · saved to records</p>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input w-auto" value={date} max={todayIST()}
            onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="card lg:col-span-3 space-y-1">
          {loading ? (
            <div className="space-y-3 py-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <>
              {rows.map((r) => (
                <div key={r.label} className={`flex items-center justify-between py-3 ${r.bold ? 'border-t border-ink-50' : ''}`}>
                  <span className={`text-sm ${r.bold ? 'font-semibold text-ink' : 'text-ink-300'}`}>{r.label}</span>
                  <span className={`font-mono font-semibold ${r.accent} ${r.bold ? 'text-lg' : ''}`}>{formatINR(r.value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-4 mt-1 border-t-2 border-ink-100">
                <span className="font-heading font-bold text-ink text-lg">Net Profit</span>
                <span className={`font-mono font-extrabold text-2xl ${summary.net_profit >= 0 ? 'text-leaf' : 'text-press'}`}>
                  {formatINR(summary.net_profit)}
                </span>
              </div>
              <button className="btn-primary w-full" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : `Save summary for ${formatDate(date)}`}
              </button>
            </>
          )}
        </div>

        {/* History */}
        <div className="card lg:col-span-2">
          <h3 className="font-heading font-bold text-ink mb-4">Past Summaries</h3>
          {history.length === 0 ? (
            <EmptyState icon="📅" title="No saved summaries" message="Save today's summary to start a record." />
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto">
              {history.map((h) => (
                <motion.button key={h.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => setDate(h.date)}
                  className="w-full text-left bg-white rounded-xl px-4 py-3 shadow-card hover:shadow-cardHover transition-shadow">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-charcoal text-sm">{formatDate(h.date)}</span>
                    <span className={`font-mono font-semibold text-sm ${Number(h.net_profit) >= 0 ? 'text-leaf' : 'text-press'}`}>
                      {formatINR(h.net_profit)}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-300 mt-0.5 font-mono">
                    Cash {formatINR(h.total_cash)} · UPI {formatINR(h.total_upi)} · Exp {formatINR(h.total_expenses)}
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
