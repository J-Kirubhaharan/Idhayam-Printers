import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate, paymentStatusOf, todayIST } from '../lib/format'
import StatusBadge, { PaymentBadge, PaymentStatusBadge } from '../components/StatusBadge'
import { SkeletonRow } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import ShopLogo from '../components/ShopLogo'
import JobDetailPanel from '../components/JobDetailPanel'

// the bill number is the shared base, e.g. IPO-2026-011 (strip only the -1/-2 item
// suffix on multi-item orders; a plain IPO-YYYY-NNN id is kept as-is)
const billNoOf = (jobId) => {
  const p = (jobId || '').split('-')
  return p.length > 3 ? p.slice(0, 3).join('-') : (jobId || '')
}
// numeric sort key from a bill id: IPO-2026-011 -> 2026 * 100000 + 11
const sortKeyOf = (billNo) => {
  const p = billNo.split('-')
  const yr = parseInt(p[1], 10) || 0
  const num = parseInt(p[2], 10) || 0
  return yr * 100000 + num
}
// calendar-day key (IST) for grouping, e.g. "2026-06-12"
const dayKey = (iso) => {
  try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
  catch { return '' }
}

export default function AllOrders() {
  const navigate = useNavigate()
  const printRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState([])
  const [paidByJob, setPaidByJob] = useState({})
  const [query, setQuery] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)
  const [groupByDate, setGroupByDate] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: jobsData }, { data: pays }] = await Promise.all([
      supabase.from('jobs').select('*, customers(name,contact,alt_contact,place)').is('deleted_at', null),
      supabase.from('payments').select('job_id,amount')
    ])
    const paid = {}
    ;(pays || []).forEach((p) => { paid[p.job_id] = (paid[p.job_id] || 0) + Number(p.amount) })
    setPaidByJob(paid)
    setJobs(jobsData || [])
    setLoading(false)
  }

  // group jobs into orders (multi-item orders collapse into one row by order_group)
  const orders = useMemo(() => {
    const groups = new Map()
    for (const j of jobs) {
      const key = j.order_group || j.id
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(j)
    }
    const list = []
    for (const [key, items] of groups) {
      items.sort((a, b) => (a.job_id || '').localeCompare(b.job_id || ''))
      const first = items[0]
      const billNo = billNoOf(first.job_id)
      const gross = items.reduce((s, j) => s + Number(j.total_amount), 0)
      const discount = items.reduce((s, j) => s + (Number(j.discount) || 0), 0)
      const amount = Math.max(0, gross - discount)  // net of any discount
      const paid = items.reduce((s, j) => s + (paidByJob[j.id] || 0), 0)
      const statuses = [...new Set(items.map((j) => j.status))]
      const types = items.map((j) => (j.job_type === 'Other' ? j.custom_job_type : j.job_type))
      list.push({
        key,
        billNo,
        order_group: first.order_group,
        firstId: first.id,
        customer: first.customers,
        urgent: items.some((j) => j.is_urgent),
        itemCount: items.length,
        typeLabel: items.length > 1 ? `${types[0]} +${items.length - 1}` : types[0],
        amount,
        paid,
        payStatus: paymentStatusOf({ payment_type: first.payment_type, total_amount: amount }, paid),
        payMethod: first.payment_type,
        delivery: statuses.length === 1 ? statuses[0] : 'Mixed',
        date: first.created_at,
        sortKey: sortKeyOf(billNo)
      })
    }
    list.sort((a, b) => {
      const da = new Date(a.date).getTime(), db = new Date(b.date).getTime()
      if (da !== db) return newestFirst ? db - da : da - db
      return newestFirst ? b.sortKey - a.sortKey : a.sortKey - b.sortKey  // same day → bill order
    })
    return list
  }, [jobs, paidByJob, newestFirst])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((o) => {
      const hay = [o.billNo, o.customer?.name, o.customer?.place, o.typeLabel, formatDate(o.date)]
        .join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [orders, query])

  // open the slide-in detail/edit panel for the order's job
  const openOrder = async (o) => {
    const { data } = await supabase
      .from('jobs').select('*, customers(name,contact,alt_contact,place)')
      .eq('id', o.firstId).is('deleted_at', null).maybeSingle()
    if (data) setSelectedJob(data)
    else toast('That order is no longer available.')
  }

  const refreshSelected = async () => {
    await load()  // edits/deletes change the register
    if (!selectedJob) return
    const { data } = await supabase
      .from('jobs').select('*, customers(name,contact,alt_contact,place)')
      .eq('id', selectedJob.id).is('deleted_at', null).maybeSingle()
    setSelectedJob(data || null)
  }

  // orders grouped under their date (for the "By date" view); keeps the chosen order
  const dateGroups = useMemo(() => {
    const m = new Map()
    for (const o of filtered) {
      const k = dayKey(o.date)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(o)
    }
    return [...m.entries()].map(([day, list]) => ({
      day,
      label: formatDate(list[0].date),
      list,
      total: list.reduce((s, o) => s + o.amount, 0)
    }))
  }, [filtered])

  // totals for the rows currently shown (respects search)
  const totals = useMemo(() => {
    const amount = filtered.reduce((s, o) => s + o.amount, 0)
    const paid = filtered.reduce((s, o) => s + o.paid, 0)
    return { amount, paid, balance: Math.max(0, amount - paid) }
  }, [filtered])

  const handleDownload = async () => {
    if (!printRef.current || filtered.length === 0) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const img = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4', compress: true })  // landscape — wide table
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width
      pdf.addImage(img, 'JPEG', 0, 0, imgW, imgH)
      let heightLeft = imgH - pageH
      let position = 0
      while (heightLeft > 5) {
        position -= pageH
        pdf.addPage()
        pdf.addImage(img, 'JPEG', 0, position, imgW, imgH)
        heightLeft -= pageH
      }
      pdf.save(`Order-History-${todayIST()}.pdf`)
      toast.success('Order history downloaded')
    } catch (e) {
      console.error(e)
      toast.error('Could not generate PDF')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-ink">All Orders</h1>
          <p className="text-sm text-ink-300">{orders.length} orders · complete register, in ID order</p>
        </div>
        <button className="btn-accent" onClick={() => navigate('/new-job')}>+ New Job</button>
      </div>

      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-300">⌕</span>
          <input className="input pl-10" placeholder="Search by ID, name, place or type…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button onClick={() => setNewestFirst((v) => !v)}
          className="px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-white text-ink border border-ink-100 hover:bg-ink-50 whitespace-nowrap">
          {newestFirst ? '↓ Newest first' : '↑ Oldest first'}
        </button>
        <button onClick={() => setGroupByDate((v) => !v)}
          className={`px-3.5 py-2.5 rounded-xl text-sm font-semibold border whitespace-nowrap transition-colors ${groupByDate ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-ink-100 hover:bg-ink-50'}`}>
          {groupByDate ? '📅 By date ✓' : '📅 By date'}
        </button>
        <button onClick={handleDownload} disabled={downloading || filtered.length === 0}
          className="btn-accent whitespace-nowrap disabled:opacity-50">
          {downloading ? 'Generating…' : '⬇ Download PDF'}
        </button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50/60 text-ink-400 text-xs uppercase tracking-wide">
                <th className="text-left font-semibold px-4 py-3">Bill No</th>
                <th className="text-left font-semibold px-4 py-3">Customer</th>
                <th className="text-left font-semibold px-4 py-3">Items</th>
                <th className="text-right font-semibold px-4 py-3">Amount</th>
                <th className="text-left font-semibold px-4 py-3">Method</th>
                <th className="text-left font-semibold px-4 py-3">Payment</th>
                <th className="text-left font-semibold px-4 py-3">Delivery</th>
                <th className="text-left font-semibold px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState icon="📒" title="No orders found"
                      message={query ? 'Try a different search.' : 'Orders appear here as you create jobs.'}
                      action={!query && <button className="btn-accent" onClick={() => navigate('/new-job')}>New Job</button>} />
                  </td>
                </tr>
              ) : groupByDate ? (
                dateGroups.map((g) => (
                  <Fragment key={g.day}>
                    <tr className="bg-ink-50/80">
                      <td colSpan={8} className="px-4 py-2">
                        <div className="flex items-center justify-between">
                          <span className="font-heading font-bold text-ink text-sm">📅 {g.label}</span>
                          <span className="text-xs text-ink-400">
                            {g.list.length} order{g.list.length > 1 ? 's' : ''} · <span className="font-mono font-semibold text-charcoal">{formatINR(g.total)}</span>
                          </span>
                        </div>
                      </td>
                    </tr>
                    {g.list.map((o) => <OrderRow key={o.key} o={o} onOpen={openOrder} />)}
                  </Fragment>
                ))
              ) : (
                filtered.map((o) => <OrderRow key={o.key} o={o} onOpen={openOrder} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Off-screen printable report for the PDF download (landscape) */}
      <div className="fixed left-[-9999px] top-0" aria-hidden="true">
        <div ref={printRef} style={{ width: '1120px' }} className="bg-white p-8">
          <div className="flex items-center justify-between border-b-2 border-charcoal pb-4 mb-5">
            <div className="flex items-center gap-3">
              <ShopLogo size={54} />
              <div>
                <div className="font-heading font-extrabold text-xl text-charcoal leading-tight">Idhayam Printers</div>
                <div className="text-sm text-gray-500">Order History</div>
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="text-gray-500">Generated: <span className="text-charcoal font-medium">{formatDate(todayIST())}</span></div>
              <div className="text-gray-500">Orders: <span className="text-charcoal font-medium">{filtered.length}</span></div>
              {query && <div className="text-gray-500">Filter: <span className="text-charcoal font-medium">“{query}”</span></div>}
            </div>
          </div>

          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-charcoal text-white uppercase tracking-wide text-[10px]">
                <th className="text-left font-semibold px-3 py-2">Bill No</th>
                <th className="text-left font-semibold px-3 py-2">Customer</th>
                <th className="text-left font-semibold px-3 py-2">Place</th>
                <th className="text-left font-semibold px-3 py-2">Items</th>
                <th className="text-right font-semibold px-3 py-2">Amount</th>
                <th className="text-right font-semibold px-3 py-2">Paid</th>
                <th className="text-left font-semibold px-3 py-2">Method</th>
                <th className="text-left font-semibold px-3 py-2">Payment</th>
                <th className="text-left font-semibold px-3 py-2">Delivery</th>
                <th className="text-left font-semibold px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <tr key={o.key} className={i % 2 === 0 ? 'bg-[#f4f4f4]' : 'bg-white'}>
                  <td className="px-3 py-1.5 font-mono text-charcoal">{o.urgent ? '⚡ ' : ''}{o.billNo}</td>
                  <td className="px-3 py-1.5 text-charcoal font-medium">{o.customer?.name || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500">{o.customer?.place || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-600">{o.typeLabel}{o.itemCount > 1 ? ` (${o.itemCount})` : ''}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-charcoal">{formatINR(o.amount)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600">{formatINR(o.paid)}</td>
                  <td className="px-3 py-1.5 text-gray-600">{o.payMethod}</td>
                  <td className="px-3 py-1.5 text-gray-600">{o.payStatus}</td>
                  <td className="px-3 py-1.5 text-gray-600">{o.delivery}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{formatDate(o.date)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-charcoal font-bold text-charcoal">
                <td className="px-3 py-2" colSpan={4}>TOTAL ({filtered.length} orders)</td>
                <td className="px-3 py-2 text-right font-mono">{formatINR(totals.amount)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatINR(totals.paid)}</td>
                <td className="px-3 py-2 text-gray-500 font-normal" colSpan={4}>Balance: {formatINR(totals.balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onChanged={refreshSelected}
          onDuplicate={(job) => { setSelectedJob(null); navigate('/new-job', { state: { duplicate: job } }) }}
        />
      )}
    </div>
  )
}

function OrderRow({ o, onOpen }) {
  return (
    <tr className="table-row-hover cursor-pointer" onClick={() => onOpen(o)}>
      <td className="px-4 py-3 font-mono text-xs text-ink-400 whitespace-nowrap">{o.billNo}</td>
      <td className="px-4 py-3 font-medium text-charcoal">
        {o.customer?.name || '—'}
        {o.customer?.place && <span className="text-press font-normal"> · {o.customer.place}</span>}
      </td>
      <td className="px-4 py-3 text-ink-400">
        {o.typeLabel}
        {o.itemCount > 1 && <span className="ml-1.5 pill bg-ink-50 text-ink-400 text-[10px]">{o.itemCount} items</span>}
      </td>
      <td className="px-4 py-3 text-right font-mono">{formatINR(o.amount)}</td>
      <td className="px-4 py-3"><PaymentBadge type={o.payMethod} /></td>
      <td className="px-4 py-3"><PaymentStatusBadge status={o.payStatus} /></td>
      <td className="px-4 py-3">
        {o.delivery === 'Mixed'
          ? <span className="pill bg-ink-100/60 text-ink">Mixed</span>
          : <StatusBadge status={o.delivery} />}
      </td>
      <td className="px-4 py-3 text-ink-400 whitespace-nowrap">{formatDate(o.date)}</td>
    </tr>
  )
}
