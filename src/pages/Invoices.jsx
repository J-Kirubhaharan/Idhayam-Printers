import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate, todayIST } from '../lib/format'
import { SkeletonRow } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import InvoiceSheet, { billNoOf } from '../components/InvoiceSheet'

const dayKey = (iso) => {
  try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
  catch { return '' }
}
const sortKeyOf = (billNo) => {
  const p = billNo.split('-')
  return (parseInt(p[1], 10) || 0) * 100000 + (parseInt(p[2], 10) || 0)
}

// wait for any <img> inside a node to finish loading (so the logo is in the canvas)
const waitForImages = (node) => {
  const imgs = [...node.querySelectorAll('img')]
  return Promise.all(imgs.map((img) => img.complete
    ? Promise.resolve()
    : new Promise((r) => { img.onload = r; img.onerror = r; setTimeout(r, 2500) })))
}

// render one order's invoice off-screen and capture it to a canvas
const renderInvoiceCanvas = async (order) => {
  const holder = document.createElement('div')
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff'
  document.body.appendChild(holder)
  const root = createRoot(holder)
  let sheetEl = null
  await new Promise((res) => {
    root.render(<InvoiceSheet jobs={order.jobs} paid={order.paid} innerRef={(el) => { if (el) sheetEl = el }} />)
    requestAnimationFrame(() => requestAnimationFrame(res))
  })
  await waitForImages(holder)
  const canvas = await html2canvas(sheetEl || holder.firstChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  root.unmount()
  holder.remove()
  return canvas
}

export default function Invoices() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [idsInput, setIdsInput] = useState('')
  const [checked, setChecked] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: jobsData }, { data: pays }] = await Promise.all([
      supabase.from('jobs').select('*, customers(name,contact,alt_contact,place)').is('deleted_at', null),
      supabase.from('payments').select('job_id,amount')
    ])
    const paid = {}
    ;(pays || []).forEach((p) => { paid[p.job_id] = (paid[p.job_id] || 0) + Number(p.amount) })

    const groups = new Map()
    for (const j of jobsData || []) {
      const key = j.order_group || j.id
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(j)
    }
    const list = []
    for (const [key, items] of groups) {
      items.sort((a, b) => (a.job_id || '').localeCompare(b.job_id || ''))
      const first = items[0]
      const billNo = billNoOf(first.job_id)
      const amount = items.reduce((s, j) => s + Math.max(0, Number(j.total_amount) - (Number(j.discount) || 0)), 0)
      const paidSum = items.reduce((s, j) => s + (paid[j.id] || 0), 0)
      list.push({
        key, billNo, group: first.order_group,
        customer: first.customers, place: first.customers?.place || '',
        date: first.created_at, jobs: items, paid: paidSum, amount,
        payMethod: first.payment_type, sortKey: sortKeyOf(billNo)
      })
    }
    list.sort((a, b) => b.sortKey - a.sortKey)  // newest first
    setOrders(list)
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const ids = idsInput.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    return orders.filter((o) => {
      const d = dayKey(o.date)
      if (from && d < from) return false
      if (to && d > to) return false
      if (ids.length && !ids.some((tok) => o.billNo.toLowerCase().includes(tok))) return false
      return true
    })
  }, [orders, from, to, idsInput])

  // effective set: ticked rows, or (if none ticked) everything currently filtered
  const effective = useMemo(() => {
    const ticked = filtered.filter((o) => checked.has(o.key))
    return ticked.length ? ticked : filtered
  }, [filtered, checked])

  const allVisibleChecked = filtered.length > 0 && filtered.every((o) => checked.has(o.key))
  const toggleAll = () => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (allVisibleChecked) filtered.forEach((o) => next.delete(o.key))
      else filtered.forEach((o) => next.add(o.key))
      return next
    })
  }
  const toggleOne = (key) => setChecked((prev) => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const openInvoice = (o) => navigate(o.group ? `/order/${o.group}` : `/invoice/${o.jobs[0].id}`)

  const downloadMerged = async () => {
    const list = effective
    if (!list.length) return
    if (list.length > 100 && !window.confirm(`This will generate ${list.length} invoices into one PDF and may take a few minutes. Continue?`)) return
    setBusy(true)
    setProgress({ done: 0, total: list.length })
    try {
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      let first = true
      for (const o of list) {
        const canvas = await renderInvoiceCanvas(o)
        const img = canvas.toDataURL('image/jpeg', 0.9)
        const imgW = pageW
        const imgH = (canvas.height * imgW) / canvas.width
        if (!first) pdf.addPage()
        first = false
        pdf.addImage(img, 'JPEG', 0, 0, imgW, imgH)
        let heightLeft = imgH - pageH
        let pos = 0
        while (heightLeft > 5) { pos -= pageH; pdf.addPage(); pdf.addImage(img, 'JPEG', 0, pos, imgW, imgH); heightLeft -= pageH }
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }
      pdf.save(`Invoices-${todayIST()}.pdf`)
      toast.success(`${list.length} invoice${list.length > 1 ? 's' : ''} downloaded`)
    } catch (e) {
      console.error(e)
      toast.error('Could not generate the PDF')
    } finally {
      setBusy(false)
    }
  }

  const downloadCSV = () => {
    const list = effective
    if (!list.length) return
    const cell = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = [['Bill No', 'Date', 'Customer', 'Place', 'Amount', 'Paid', 'Balance', 'Payment']]
    for (const o of list) {
      rows.push([o.billNo, formatDate(o.date), o.customer?.name || '', o.place,
        o.amount, o.paid, Math.max(0, o.amount - o.paid), o.payMethod])
    }
    const csv = rows.map((r) => r.map(cell).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `Invoice-Summary-${todayIST()}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Summary downloaded')
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading font-bold text-2xl text-ink">Invoices</h1>
        <p className="text-sm text-ink-300">{orders.length} invoices · click one to open it, or download many at once</p>
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">From date</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To date</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="label">Bill numbers (comma-separated)</label>
            <input className="input" placeholder="e.g. 011, 014, 020" value={idsInput} onChange={(e) => setIdsInput(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(from || to || idsInput) && (
            <button onClick={() => { setFrom(''); setTo(''); setIdsInput('') }}
              className="text-xs font-semibold text-ink-300 hover:text-press">Clear filters</button>
          )}
          <div className="flex-1" />
          <button onClick={downloadCSV} disabled={busy || effective.length === 0}
            className="btn-outline text-sm disabled:opacity-50">⬇ Summary (CSV) · {effective.length}</button>
          <button onClick={downloadMerged} disabled={busy || effective.length === 0}
            className="btn-accent text-sm disabled:opacity-50">
            {busy ? `Generating ${progress.done}/${progress.total}…` : `⬇ Download invoices (PDF) · ${effective.length}`}
          </button>
        </div>
        <p className="text-[11px] text-ink-300">
          Tick rows to pick specific invoices, or leave all unticked to use everything in the current filter.
        </p>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50/60 text-ink-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 w-10 text-center">
                  <input type="checkbox" checked={allVisibleChecked} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="text-left font-semibold px-4 py-3">Bill No</th>
                <th className="text-left font-semibold px-4 py-3">Customer</th>
                <th className="text-left font-semibold px-4 py-3">Place</th>
                <th className="text-right font-semibold px-4 py-3">Amount</th>
                <th className="text-left font-semibold px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6}>
                  <EmptyState icon="🧾" title="No invoices found"
                    message={orders.length ? 'Try a different date range or bill number.' : 'Invoices appear here as you create jobs.'} />
                </td></tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.key} className="table-row-hover">
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked.has(o.key)} onChange={() => toggleOne(o.key)} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-400 whitespace-nowrap cursor-pointer" onClick={() => openInvoice(o)}>{o.billNo}</td>
                    <td className="px-4 py-3 font-medium text-charcoal cursor-pointer" onClick={() => openInvoice(o)}>{o.customer?.name || '—'}</td>
                    <td className="px-4 py-3 text-press cursor-pointer" onClick={() => openInvoice(o)}>{o.place || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono cursor-pointer" onClick={() => openInvoice(o)}>{formatINR(o.amount)}</td>
                    <td className="px-4 py-3 text-ink-400 whitespace-nowrap cursor-pointer" onClick={() => openInvoice(o)}>{formatDate(o.date)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {busy && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-panel px-8 py-6 text-center">
            <div className="font-heading font-bold text-ink mb-1">Generating invoices…</div>
            <div className="text-sm text-ink-300 mb-3">{progress.done} / {progress.total}</div>
            <div className="w-56 h-2 bg-ink-50 rounded-full overflow-hidden">
              <div className="h-full bg-press transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
