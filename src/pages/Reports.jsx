import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate, startOfDayISO, endOfDayISO, todayIST } from '../lib/format'
import StatCard from '../components/StatCard'
import { Skeleton, SkeletonCard } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'

const PIE_COLORS = ['#1B2B4B', '#E63946', '#2D6A4F', '#F4A261', '#4E6790', '#F26876', '#7689A9', '#B82A35', '#9FACC4', '#2D2D2D']

// default range: last 6 months
const defaultFrom = () => {
  const d = new Date()
  d.setMonth(d.getMonth() - 5)
  d.setDate(1)
  return d.toISOString().split('T')[0]
}

export default function Reports() {
  const [from, setFrom] = useState(defaultFrom())
  const [to, setTo] = useState(todayIST())
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => { load() }, [from, to])

  const load = async () => {
    setLoading(true)
    const start = startOfDayISO(from)
    const end = endOfDayISO(to)

    const [{ data: jobs }, { data: pays }, { data: exps }, { data: customers }] = await Promise.all([
      supabase.from('jobs').select('*, customers(name)').is('deleted_at', null).gte('created_at', start).lte('created_at', end),
      supabase.from('payments').select('amount,payment_date').gte('payment_date', start).lte('payment_date', end),
      supabase.from('expenses').select('amount,category,custom_category,created_at').gte('created_at', start).lte('created_at', end),
      supabase.from('customers').select('name,total_pending')
    ])

    setData(build(jobs || [], pays || [], exps || [], customers || []))
    setLoading(false)
  }

  const monthKey = (s) => {
    const d = new Date(s)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const monthLabel = (key) => {
    const [y, m] = key.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' })
  }

  const build = (jobs, pays, exps, customers) => {
    // monthly income (payments) vs expense
    const months = {}
    const ensure = (k) => (months[k] ||= { key: k, income: 0, expense: 0 })
    pays.forEach((p) => { ensure(monthKey(p.payment_date)).income += Number(p.amount) })
    exps.forEach((e) => { ensure(monthKey(e.created_at)).expense += Number(e.amount) })
    const monthly = Object.values(months)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((m) => ({ month: monthLabel(m.key), Income: m.income, Expense: m.expense, Profit: m.income - m.expense }))

    // best / worst month by profit
    let best = null, worst = null
    monthly.forEach((m) => {
      if (!best || m.Profit > best.Profit) best = m
      if (!worst || m.Profit < worst.Profit) worst = m
    })

    // top customers by revenue (job totals in range)
    const byCustomer = {}
    jobs.forEach((j) => {
      const name = j.customers?.name || 'Unknown'
      byCustomer[name] = (byCustomer[name] || 0) + Number(j.total_amount)
    })
    const topCustomers = Object.entries(byCustomer)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 10)

    // popular job types (count)
    const byType = {}
    jobs.forEach((j) => {
      const t = j.job_type === 'Other' ? (j.custom_job_type || 'Other') : j.job_type
      byType[t] = (byType[t] || 0) + 1
    })
    const jobTypes = Object.entries(byType)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    // expense breakdown by category
    const byCat = {}
    exps.forEach((e) => {
      const c = e.category === 'Other' ? (e.custom_category || 'Other') : e.category
      byCat[c] = (byCat[c] || 0) + Number(e.amount)
    })
    const expenseBreakdown = Object.entries(byCat)
      .map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

    // credit outstanding
    const creditOutstanding = customers
      .filter((c) => Number(c.total_pending) > 0)
      .map((c) => ({ name: c.name, value: Number(c.total_pending) }))
      .sort((a, b) => b.value - a.value)

    const totals = {
      revenue: jobs.reduce((s, j) => s + Number(j.total_amount), 0),
      collected: pays.reduce((s, p) => s + Number(p.amount), 0),
      expenses: exps.reduce((s, e) => s + Number(e.amount), 0),
      outstanding: creditOutstanding.reduce((s, c) => s + c.value, 0),
      jobCount: jobs.length
    }

    return { monthly, best, worst, topCustomers, jobTypes, expenseBreakdown, creditOutstanding, totals }
  }

  const hasData = data && data.totals.jobCount + data.monthly.length > 0

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-ink">Reports</h1>
          <p className="text-sm text-ink-300">Insights across a date range</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="label">From</label>
            <input type="date" className="input w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input w-auto" value={to} max={todayIST()} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Revenue (jobs)" value={formatINR(data.totals.revenue)} accent="ink" icon="₹" />
            <StatCard label="Collected" value={formatINR(data.totals.collected)} accent="leaf" icon="↓" />
            <StatCard label="Expenses" value={formatINR(data.totals.expenses)} accent="press" icon="−" />
            <StatCard label="Outstanding" value={formatINR(data.totals.outstanding)} accent="amber" icon="◷" />
          </>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card"><Skeleton className="h-64 w-full" /></div>)}
        </div>
      ) : !hasData ? (
        <div className="card"><EmptyState icon="📊" title="No data in this range" message="Try widening the date range." /></div>
      ) : (
        <>
          {/* Best / worst month */}
          {(data.best || data.worst) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card border-l-4 border-leaf">
                <div className="label">Best Month</div>
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold text-ink text-lg">{data.best?.month || '—'}</span>
                  <span className="font-mono font-bold text-leaf">{formatINR(data.best?.Profit || 0)}</span>
                </div>
              </div>
              <div className="card border-l-4 border-press">
                <div className="label">Worst Month</div>
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold text-ink text-lg">{data.worst?.month || '—'}</span>
                  <span className="font-mono font-bold text-press">{formatINR(data.worst?.Profit || 0)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Income vs Expense */}
            <div className="card">
              <h3 className="font-heading font-bold text-ink mb-4">Income vs Expense</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#7689A9' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#7689A9' }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
                  <Tooltip formatter={(v) => formatINR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #E8ECF3', fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Income" fill="#2D6A4F" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Expense" fill="#E63946" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Profit trend */}
            <div className="card">
              <h3 className="font-heading font-bold text-ink mb-4">Profit Trend</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.monthly} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#7689A9' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#7689A9' }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
                  <Tooltip formatter={(v) => formatINR(v)} contentStyle={{ borderRadius: 12, border: '1px solid #E8ECF3', fontSize: 13 }} />
                  <Line type="monotone" dataKey="Profit" stroke="#1B2B4B" strokeWidth={2.5}
                    dot={{ r: 3, fill: '#E63946' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Popular job types */}
            <div className="card">
              <h3 className="font-heading font-bold text-ink mb-4">Popular Job Types</h3>
              {data.jobTypes.length === 0 ? (
                <EmptyState icon="🖨️" title="No jobs in range" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={data.jobTypes} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={95} innerRadius={50} paddingAngle={2}>
                      {data.jobTypes.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${v} jobs`, n]} contentStyle={{ borderRadius: 12, border: '1px solid #E8ECF3', fontSize: 13 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Expense breakdown */}
            <div className="card">
              <h3 className="font-heading font-bold text-ink mb-4">Expense Breakdown</h3>
              {data.expenseBreakdown.length === 0 ? (
                <EmptyState icon="🧾" title="No expenses in range" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={data.expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}>
                      {data.expenseBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [formatINR(v), n]} contentStyle={{ borderRadius: 12, border: '1px solid #E8ECF3', fontSize: 13 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top customers + credit outstanding */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card">
              <h3 className="font-heading font-bold text-ink mb-4">Top 10 Customers by Revenue</h3>
              {data.topCustomers.length === 0 ? (
                <EmptyState icon="👥" title="No customers in range" />
              ) : (
                <div className="space-y-2">
                  {data.topCustomers.map((c, i) => {
                    const max = data.topCustomers[0].value || 1
                    return (
                      <div key={c.name}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-charcoal truncate">{i + 1}. {c.name}</span>
                          <span className="font-mono text-ink-400">{formatINR(c.value)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-ink-50 overflow-hidden">
                          <div className="h-full bg-ink rounded-full" style={{ width: `${(c.value / max) * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <h3 className="font-heading font-bold text-ink mb-4">Credit Outstanding</h3>
              {data.creditOutstanding.length === 0 ? (
                <EmptyState icon="✅" title="No outstanding credit" message="All dues are settled." />
              ) : (
                <div className="divide-y divide-ink-50 max-h-[300px] overflow-y-auto">
                  {data.creditOutstanding.map((c) => (
                    <div key={c.name} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="font-medium text-charcoal truncate">{c.name}</span>
                      <span className="font-mono font-semibold text-press">{formatINR(c.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
