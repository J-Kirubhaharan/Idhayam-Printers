import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR } from '../lib/format'

const DEFAULT_TYPES = [
  'Banner', 'Flex', 'Poster', 'Pamphlet/Flyer', 'Brochure', 'Visiting Card',
  'Letter Head', 'ID Card', 'Sticker', 'Calendar', 'Book Printing', 'Binding',
  'Notebook', 'Bill Book', 'Invoice Book', 'Certificate', 'Envelope', 'Stamp',
  'Receipt Book', 'Files & Folders'
]
const PAPER_SIZES = ['A3', 'A4', 'A5', 'A6', 'Other']
const STATUSES = ['Pending', 'In Progress', 'Ready for Pickup', 'Delivered']

const emptyItem = () => ({
  jobType: '', customJobType: '', paperSize: '', customPaperSize: '',
  flexWidth: '', flexHeight: '', flexUnit: 'ft', quantity: '', rate: '', total: ''
})

// qty × rate when both are given; otherwise the manually-typed total
const hasQtyRate = (it) => it.quantity !== '' && it.rate !== '' && !isNaN(Number(it.quantity)) && !isNaN(Number(it.rate))
const lineTotal = (it) => hasQtyRate(it) ? Number(it.quantity) * Number(it.rate) : (Number(it.total) || 0)

export default function AddOldRecord() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const [customerName, setCustomerName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [additional, setAdditional] = useState('')
  const [place, setPlace] = useState('')
  const [orderDate, setOrderDate] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [status, setStatus] = useState('Delivered')
  const [paymentType, setPaymentType] = useState('Cash')
  const [paidVia, setPaidVia] = useState('Cash')
  const [paidNow, setPaidNow] = useState('')
  const [notes, setNotes] = useState('')

  const [customers, setCustomers] = useState([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [jobTypes, setJobTypes] = useState(DEFAULT_TYPES)

  useEffect(() => {
    supabase.from('customers').select('id,name,contact,alt_contact,place').order('name')
      .then(({ data }) => setCustomers(data || []))
    supabase
  .from('job_types')
  .select('name')
  .order('sort_order', { ascending: true })
  .order('name', { ascending: true }).then(({ data }) => {
      if (data?.length) {
        const names = data.map((x) => x.name)
        const extras = names.filter((n) => !DEFAULT_TYPES.includes(n))
        setJobTypes([...DEFAULT_TYPES.filter((n) => names.includes(n)), ...extras])
      }
    })
  }, [])

  const setItem = (i, key, val) => setItems(items.map((it, idx) => idx === i ? { ...it, [key]: val } : it))
  const addItem = () => setItems([...items, emptyItem()])
  const removeItem = (i) => setItems(items.length > 1 ? items.filter((_, idx) => idx !== i) : items)

  const suggestions = useMemo(() => {
    const q = customerName.trim().toLowerCase()
    if (!q) return []
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
  }, [customerName, customers])

  const grandTotal = useMemo(() => items.reduce((s, it) => s + lineTotal(it), 0), [items])
  const isCredit = paymentType === 'Credit'

  const handleSubmit = async () => {
    if (!customerName.trim()) return toast.error('Enter the customer name')
    if (!orderDate) return toast.error('Pick the order date')
    const valid = items.filter((it) => it.jobType && lineTotal(it) > 0)
    if (!valid.length) return toast.error('Add at least one job with an amount')

    setBusy(true)
    try {
      // 1. customer — identify by phone, else by name + place (same as New Job)
      const name = customerName.trim()
      const phone = whatsapp.trim()
      const altPhone = additional.trim()
      const pl = place.trim()
      let existing = null
      if (phone) {
        const { data } = await supabase.from('customers').select('id,name,contact,alt_contact,place')
          .or(`contact.eq.${phone},alt_contact.eq.${phone}`).limit(1)
        existing = data?.[0] || null
      } else {
        let q = supabase.from('customers').select('id,name,contact,alt_contact,place').ilike('name', name).is('contact', null)
        q = pl ? q.ilike('place', pl) : q.is('place', null)
        const { data } = await q.limit(1)
        existing = data?.[0] || null
      }
      let customerId
      if (existing) {
        customerId = existing.id
        const patch = {}
        if (phone && !existing.contact) patch.contact = phone
        if (altPhone && !existing.alt_contact) patch.alt_contact = altPhone
        if (pl && !existing.place) patch.place = pl
        if (Object.keys(patch).length) await supabase.from('customers').update(patch).eq('id', customerId)
      } else {
        const { data: created, error } = await supabase.from('customers')
          .insert({ name, contact: phone || null, alt_contact: altPhone || null, place: pl || null })
          .select('id').single()
        if (error) throw error
        customerId = created.id
      }

      // 2. allocate a bill number for the ORDER-DATE's year (IP-2024-..., etc.)
      const yr = orderDate.slice(0, 4)
      const { data: idRows } = await supabase.from('jobs').select('job_id').like('job_id', `IP-${yr}-%`)
      let maxBase = 0
      for (const r of idRows || []) {
        const n = parseInt((r.job_id || '').split('-')[2], 10)
        if (!isNaN(n) && n > maxBase) maxBase = n
      }
      const baseStr = `IP-${yr}-${String(maxBase + 1).padStart(3, '0')}`
      const multi = valid.length > 1
      const createdAtISO = new Date(`${orderDate}T12:00:00+05:30`).toISOString()

      // 3. create the jobs, dated to the order date, kept off the production boards
      const orderGroup = crypto.randomUUID()
      const created = []
      let n = 0
      for (const it of valid) {
        n += 1
        const amount = lineTotal(it)
        const qty = Number(it.quantity) || 1
        const rate = (it.rate !== '' && !isNaN(Number(it.rate))) ? Number(it.rate) : (qty ? amount / qty : amount)
        const { data: job, error } = await supabase.from('jobs').insert({
          customer_id: customerId,
          order_group: orderGroup,
          job_id: multi ? `${baseStr}-${n}` : baseStr,
          job_type: it.jobType,
          custom_job_type: it.jobType === 'Other' ? it.customJobType.trim() : null,
          paper_size: it.paperSize || null,
          custom_paper_size: it.paperSize === 'Other' ? it.customPaperSize.trim() : null,
          flex_width: it.jobType === 'Flex' ? it.flexWidth || null : null,
          flex_height: it.jobType === 'Flex' ? it.flexHeight || null : null,
          flex_unit: it.jobType === 'Flex' ? it.flexUnit : null,
          quantity: qty,
          rate,
          total_amount: amount,
          is_urgent: false,
          assigned_to: null,
          needs_design: false,
          needs_printing: false,
          production_stage: 'None',
          payment_type: paymentType,
          status,
          delivery_date: null,
          delivery_time: null,
          notes: notes.trim() || null,
          created_at: createdAtISO,
          delivered_at: status === 'Delivered' ? createdAtISO : null,
          ready_at: status === 'Ready for Pickup' ? createdAtISO : null
        }).select('id, total_amount').single()
        if (error) throw error
        created.push(job)
      }

      // 4. record payment, dated to the order date (so it lands in the right month)
      const paidTotal = isCredit ? Math.min(Number(paidNow) || 0, grandTotal) : grandTotal
      let remaining = paidTotal
      const payVia = isCredit ? paidVia : paymentType
      for (const job of created) {
        if (remaining <= 0) break
        const applied = Math.min(remaining, Number(job.total_amount))
        if (applied > 0) {
          await supabase.from('payments').insert({
            job_id: job.id, amount: applied, payment_type: payVia,
            payment_date: createdAtISO, notes: 'Historical record'
          })
          remaining -= applied
        }
      }

      toast.success(created.length > 1 ? `${created.length} old jobs saved` : 'Old record saved')
      navigate(`/order/${orderGroup}`)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Could not save record')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl text-ink">Add Old Record</h1>
        <p className="text-sm text-ink-300">Enter a past order with its original date. The Job ID uses that year.</p>
      </div>

      {/* Customer + date */}
      <div className="card space-y-4">
        <div className="relative">
          <label className="label">Customer Name *</label>
          <input className="input" placeholder="Start typing…" value={customerName}
            autoComplete="off"
            onChange={(e) => { setCustomerName(e.target.value); setShowSuggest(true) }}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)} />
          {showSuggest && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-cardHover border border-ink-50 overflow-hidden">
              {suggestions.map((c) => (
                <button key={c.id} type="button"
                  onMouseDown={() => { setCustomerName(c.name); setWhatsapp(c.contact || ''); setAdditional(c.alt_contact || ''); setPlace(c.place || ''); setShowSuggest(false) }}
                  className="w-full text-left px-4 py-2.5 hover:bg-ink-50 text-sm">
                  <span className="font-medium text-charcoal">{c.name}</span>
                  {c.place && <span className="text-press ml-2 text-xs">· {c.place}</span>}
                  {c.contact && <span className="text-ink-300 ml-2 text-xs font-mono">{c.contact}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">WhatsApp Number</label>
            <input className="input font-mono" value={whatsapp} autoComplete="off" inputMode="numeric"
              onChange={(e) => setWhatsapp(e.target.value)} />
          </div>
          <div>
            <label className="label">Additional Number</label>
            <input className="input font-mono" value={additional} autoComplete="off" inputMode="numeric"
              onChange={(e) => setAdditional(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Place / Area</label>
            <input className="input" value={place} autoComplete="off"
              onChange={(e) => setPlace(e.target.value)} />
          </div>
          <div>
            <label className="label">Order Date *</label>
            <input type="date" className="input" value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="card space-y-4">
        <div className="font-heading font-bold text-ink">Jobs</div>
        {items.map((it, i) => {
          const auto = hasQtyRate(it)
          return (
            <div key={i} className="rounded-xl border border-ink-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-300">Job {i + 1}</span>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)}
                    className="text-ink-300 hover:text-press text-sm">✕ Remove</button>
                )}
              </div>
              <div>
                <label className="label">Job Type *</label>
                <select className="input" value={it.jobType} onChange={(e) => setItem(i, 'jobType', e.target.value)}>
                  <option value="">Select job type…</option>
                  {jobTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  <option value="Other">Other…</option>
                </select>
              </div>
              {it.jobType === 'Other' && (
                <input className="input" placeholder="Enter job type" value={it.customJobType}
                  onChange={(e) => setItem(i, 'customJobType', e.target.value)} />
              )}
              {it.jobType === 'Flex' ? (
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" className="input font-mono" placeholder="Width" value={it.flexWidth}
                    onChange={(e) => setItem(i, 'flexWidth', e.target.value)} />
                  <input type="number" className="input font-mono" placeholder="Height" value={it.flexHeight}
                    onChange={(e) => setItem(i, 'flexHeight', e.target.value)} />
                  <select className="input" value={it.flexUnit} onChange={(e) => setItem(i, 'flexUnit', e.target.value)}>
                    <option value="ft">ft</option><option value="inches">inches</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="label">Size (optional)</label>
                  <select className="input" value={it.paperSize} onChange={(e) => setItem(i, 'paperSize', e.target.value)}>
                    <option value="">—</option>
                    {PAPER_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {it.paperSize === 'Other' && (
                    <input className="input mt-2" placeholder="Custom size" value={it.customPaperSize}
                      onChange={(e) => setItem(i, 'customPaperSize', e.target.value)} />
                  )}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label">Qty</label>
                  <input type="number" className="input font-mono" placeholder="—" value={it.quantity}
                    onChange={(e) => setItem(i, 'quantity', e.target.value)} />
                </div>
                <div>
                  <label className="label">Rate</label>
                  <input type="number" className="input font-mono" placeholder="—" value={it.rate}
                    onChange={(e) => setItem(i, 'rate', e.target.value)} />
                </div>
                <div>
                  <label className="label">Total *</label>
                  <input type="number" className="input font-mono" placeholder="0"
                    value={auto ? lineTotal(it) : it.total} disabled={auto}
                    onChange={(e) => setItem(i, 'total', e.target.value)} />
                </div>
              </div>
              {auto && <p className="text-[11px] text-ink-300">Total auto-calculated from Qty × Rate.</p>}
            </div>
          )
        })}
        <button type="button" onClick={addItem} className="btn-outline w-full">+ Add another job</button>
      </div>

      {/* Payment + status */}
      <div className="card space-y-4">
        <div>
          <label className="label">Payment</label>
          <div className="grid grid-cols-3 gap-2">
            {['Cash', 'UPI', 'Credit'].map((t) => (
              <button key={t} type="button" onClick={() => setPaymentType(t)}
                className={`btn ${paymentType === t ? 'bg-ink text-white' : 'btn-outline'}`}>{t}</button>
            ))}
          </div>
        </div>
        {isCredit && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount paid then</label>
              <input type="number" className="input font-mono" placeholder="0" max={grandTotal}
                value={paidNow} onChange={(e) => setPaidNow(e.target.value)} />
            </div>
            <div>
              <label className="label">Paid via</label>
              <div className="grid grid-cols-2 gap-2">
                {['Cash', 'UPI'].map((t) => (
                  <button key={t} type="button" onClick={() => setPaidVia(t)}
                    className={`btn text-sm ${paidVia === t ? 'bg-ink text-white' : 'btn-outline'}`}>{t}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div>
          <label className="label">Delivery Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {/* Total + save */}
      <div className="card flex items-center justify-between">
        <span className="label mb-0">Grand Total</span>
        <span className="font-mono font-bold text-leaf text-xl">{formatINR(grandTotal)}</span>
      </div>
      <button className="btn-accent w-full" disabled={busy} onClick={handleSubmit}>
        {busy ? 'Saving…' : 'Save Old Record'}
      </button>
    </div>
  )
}
