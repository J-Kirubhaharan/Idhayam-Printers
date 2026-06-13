import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR, todayIST } from '../lib/format'
import WhatsAppIcon from '../components/WhatsAppIcon'
import TimePicker from '../components/TimePicker'

const DEFAULT_TYPES = [
  'Banner', 'Flex', 'Poster', 'Pamphlet/Flyer', 'Brochure', 'Visiting Card',
  'Letter Head', 'ID Card', 'Sticker', 'Calendar', 'Book Printing', 'Binding',
  'Notebook', 'Bill Book', 'Invoice Book', 'Certificate', 'Envelope', 'Stamp',
  'Receipt Book', 'Files & Folders'
]
const PAPER_SIZES = ['A3', 'A4', 'A5', 'A6', 'Other']
const DRAFT_KEY = 'idhayam_newjob_draft'

const emptyItem = () => ({
  jobType: '', customJobType: '', paperSize: '', customPaperSize: '',
  flexWidth: '', flexHeight: '', flexUnit: 'ft', quantity: '', rate: '',
  needsDesign: true, needsPrinting: true
})

// where a job enters the production pipeline, based on which stages it needs
const startStage = (needsDesign, needsPrinting) =>
  needsDesign ? 'Design Queue' : needsPrinting ? 'Print Queue' : 'None'

const emptyForm = {
  customerName: '',
  whatsapp: '',
  additionalContact: '',
  place: '',
  items: [emptyItem()],
  deliveryDate: '',
  deliveryTime: '',
  notes: '',
  paymentType: 'Cash',
  paidNow: '',
  paidVia: 'Cash',
  isUrgent: false,
  assignedTo: ''
}

const lineTotal = (it) => (Number(it.quantity) || 0) * (Number(it.rate) || 0)
const resolveType = (it) => it.jobType === 'Other' ? (it.customJobType || '').trim() : it.jobType

export default function NewJob() {
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(emptyForm)
  const [jobTypes, setJobTypes] = useState(DEFAULT_TYPES)
  const [customers, setCustomers] = useState([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [busy, setBusy] = useState(false)
  const restored = useRef(false)
  // how the customer was resolved (set when leaving step 1): { customerId: <id|'new'>, updateContactTo?: phone }
  const [resolution, setResolution] = useState(null)
  // a pending same-person / different-person question to ask before continuing
  const [pending, setPending] = useState(null)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setItem = (i, k, v) => setForm((f) => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }))
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))
  const removeItem = (i) => setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, idx) => idx !== i) : f.items }))

  // load job types + customers; restore draft / duplicate
  useEffect(() => {
    ;(async () => {
      const [{ data: jt }, { data: cs }] = await Promise.all([
        supabase.from('job_types').select('name').order('name'),
        supabase.from('customers').select('id,name,contact,alt_contact,place').order('name')
      ])
      if (jt?.length) {
        const names = jt.map((x) => x.name)
        const extras = names.filter((n) => !DEFAULT_TYPES.includes(n))
        setJobTypes([...DEFAULT_TYPES.filter((n) => names.includes(n)), ...extras])
      }
      setCustomers(cs || [])
    })()

    // prefill from duplicate (a single job → one item)
    const dup = location.state?.duplicate
    if (dup && !restored.current) {
      restored.current = true
      setForm({
        ...emptyForm,
        customerName: dup.customers?.name || '',
        whatsapp: dup.customers?.contact || '',
        additionalContact: dup.customers?.alt_contact || '',
        place: dup.customers?.place || '',
        items: [{
          jobType: dup.job_type || '',
          customJobType: dup.custom_job_type || '',
          paperSize: dup.paper_size || '',
          customPaperSize: dup.custom_paper_size || '',
          flexWidth: dup.flex_width || '',
          flexHeight: dup.flex_height || '',
          flexUnit: dup.flex_unit || 'ft',
          quantity: String(dup.quantity ?? ''),
          rate: String(dup.rate ?? '')
        }],
        notes: dup.notes || '',
        deliveryTime: dup.delivery_time || '',
        paymentType: dup.payment_type || 'Cash',
        isUrgent: !!dup.is_urgent,
        assignedTo: dup.assigned_to || ''
      })
      toast.success('Job details copied — review & save')
      return
    }

    // restore draft
    if (!restored.current) {
      restored.current = true
      try {
        const raw = localStorage.getItem(DRAFT_KEY)
        if (raw) {
          const draft = JSON.parse(raw)
          const hasContent = draft?.customerName?.trim() ||
            (draft?.items || []).some((it) => it.jobType || it.quantity || it.rate)
          if (hasContent) {
            setForm({ ...emptyForm, ...draft, items: draft.items?.length ? draft.items : [emptyItem()] })
            toast('Draft restored', { icon: '📝' })
          }
        }
      } catch { /* ignore */ }
    }
  }, [location.state])

  // auto-save draft
  useEffect(() => {
    if (!restored.current) return
    const id = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(form)), 400)
    return () => clearTimeout(id)
  }, [form])

  // any edit to the name or number invalidates an earlier same-person decision
  useEffect(() => { setResolution(null) }, [form.customerName, form.whatsapp])

  const total = useMemo(() => form.items.reduce((s, it) => s + lineTotal(it), 0), [form.items])
  // Cash/UPI = fully paid. Credit = pay an advance now, the rest becomes pending.
  const isCredit = form.paymentType === 'Credit'
  const paidNowNum = isCredit ? Math.min(Number(form.paidNow) || 0, total) : total
  const pendingNum = isCredit ? Math.max(0, total - paidNowNum) : 0

  const suggestions = useMemo(() => {
    const q = form.customerName.trim().toLowerCase()
    if (!q) return []
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
  }, [form.customerName, customers])

  const validateStep = (s) => {
    if (s === 1) {
      if (!form.customerName.trim()) { toast.error('Enter customer name'); return false }
    }
    if (s === 2) {
      if (form.items.length === 0) { toast.error('Add at least one item'); return false }
      for (let i = 0; i < form.items.length; i++) {
        const it = form.items[i]
        const n = form.items.length > 1 ? ` (item ${i + 1})` : ''
        if (!it.jobType) { toast.error(`Select a job type${n}`); return false }
        if (it.jobType === 'Other' && !it.customJobType.trim()) { toast.error(`Enter the custom job type${n}`); return false }
        if (it.paperSize === 'Other' && !it.customPaperSize.trim()) { toast.error(`Enter the custom paper size${n}`); return false }
        if (!(Number(it.quantity) > 0)) { toast.error(`Quantity must be greater than 0${n}`); return false }
        if (!(Number(it.rate) > 0)) { toast.error(`Rate must be greater than 0${n}`); return false }
      }
    }
    return true
  }

  // Figure out who this customer is. Phone number is the identity; name is a fallback.
  // Returns either { resolution } (proceed silently) or { prompt } (ask same-person?).
  const resolveCustomer = () => {
    const name = form.customerName.trim()
    const phone = form.whatsapp.trim()
    const lc = name.toLowerCase()
    const byName = customers.filter((c) => (c.name || '').trim().toLowerCase() === lc)
    const byPhone = phone ? customers.filter((c) => c.contact === phone || c.alt_contact === phone) : []

    if (phone) {
      if (byPhone.length) {
        const owner = byPhone[0]
        // Case 3 — name AND number match the same person → silent
        if ((owner.name || '').trim().toLowerCase() === lc) return { resolution: { customerId: owner.id } }
        // Case 2 — this number already belongs to someone with a different name
        return { prompt: { kind: 'phoneOther', owner, name, phone } }
      }
      // Case 1 — name is known but the number is new
      if (byName.length) return { prompt: { kind: 'nameNewNumber', matches: byName, name, phone } }
      // Case 4 — brand new
      return { resolution: { customerId: 'new' } }
    }
    // no number entered
    // Case 5 — existing name(s), no number → must ask which one
    if (byName.length) return { prompt: { kind: 'nameNoNumber', matches: byName, name } }
    // Case 4 — brand new
    return { resolution: { customerId: 'new' } }
  }

  // user answered the same-person question
  const choose = (res) => { setResolution(res); setPending(null); setStep(2) }

  const next = () => {
    if (step === 1) {
      if (!validateStep(1)) return
      if (resolution) { setStep(2); return }      // already decided this entry
      const r = resolveCustomer()
      if (r.prompt) { setPending(r.prompt); return }  // ask first, don't advance
      setResolution(r.resolution)
      setStep(2)
      return
    }
    if (validateStep(step)) setStep((s) => Math.min(3, s + 1))
  }
  const back = () => setStep((s) => Math.max(1, s - 1))

  const bumpJobType = async (name, isCustom) => {
    if (!name) return
    const { data: row } = await supabase
      .from('job_types').select('id,usage_count,is_custom').ilike('name', name).limit(1)
    if (row?.length) {
      await supabase.from('job_types').update({ usage_count: (row[0].usage_count || 0) + 1 }).eq('id', row[0].id)
    } else {
      await supabase.from('job_types').insert({ name, is_custom: isCustom, usage_count: 1 })
    }
  }

  const handleConfirm = async () => {
    if (!validateStep(1) || !validateStep(2)) return
    if (isCredit && (Number(form.paidNow) || 0) > total) {
      return toast.error('Amount paid now cannot exceed the total')
    }
    setBusy(true)
    try {
      // 1. Resolve the customer using the decision captured when leaving step 1
      //    (phone is the identity; the same-person prompt handled any collision).
      const name = form.customerName.trim()
      const phone = form.whatsapp.trim()
      const altPhone = form.additionalContact.trim()
      const place = form.place.trim()

      let res = resolution
      if (!res) {
        // fallback (shouldn't normally happen — step 1 always decides this)
        const r = resolveCustomer()
        res = r.resolution || { customerId: r.prompt?.owner?.id || r.prompt?.matches?.[0]?.id || 'new' }
      }

      let customerId
      if (res.customerId && res.customerId !== 'new') {
        customerId = res.customerId
        const ex = customers.find((c) => c.id === customerId) || {}
        const patch = {}
        if (res.updateContactTo) patch.contact = res.updateContactTo   // "same person — new number"
        else if (phone && !ex.contact) patch.contact = phone           // fill a blank number
        if (altPhone && !ex.alt_contact) patch.alt_contact = altPhone
        if (place && !ex.place) patch.place = place
        if (Object.keys(patch).length) await supabase.from('customers').update(patch).eq('id', customerId)
        if (res.updateContactTo) toast.success(`${ex.name || 'Customer'}'s number updated`)
      } else {
        const { data: created, error: cErr } = await supabase
          .from('customers')
          .insert({ name, contact: phone || null, alt_contact: altPhone || null, place: place || null })
          .select('id').single()
        if (cErr) throw cErr
        customerId = created.id
      }

      // 2. allocate ONE bill number for the whole order. Single item -> IPO-YYYY-NNN.
      //    Multiple items -> IPO-YYYY-NNN-1, -2, -3 … so one bill = one base number.
      const yr = todayIST().slice(0, 4)
      const { data: idRows } = await supabase
        .from('jobs').select('job_id').like('job_id', `IPO-${yr}-%`)  // includes deleted, so numbers are never reused
      let maxBase = 0
      for (const r of idRows || []) {
        const n = parseInt((r.job_id || '').split('-')[2], 10)  // 3rd part = base number, ignores any -suffix
        if (!isNaN(n) && n > maxBase) maxBase = n
      }
      const baseStr = `IPO-${yr}-${String(maxBase + 1).padStart(3, '0')}`
      const multi = form.items.length > 1

      // 3. create one job per item, all sharing an order group
      const orderGroup = crypto.randomUUID()
      const created = []
      const notifs = []  // "new work arrived" alerts for the design / print teams
      let itemNo = 0
      for (const it of form.items) {
        itemNo += 1
        await bumpJobType(resolveType(it), it.jobType === 'Other')
        const jobCode = multi ? `${baseStr}-${itemNo}` : baseStr
        const stage = startStage(it.needsDesign, it.needsPrinting)
        const { data: job, error: jErr } = await supabase.from('jobs').insert({
          customer_id: customerId,
          order_group: orderGroup,
          job_id: jobCode,
          job_type: it.jobType,
          custom_job_type: it.jobType === 'Other' ? it.customJobType.trim() : null,
          paper_size: it.paperSize || null,
          custom_paper_size: it.paperSize === 'Other' ? it.customPaperSize.trim() : null,
          flex_width: it.jobType === 'Flex' ? it.flexWidth || null : null,
          flex_height: it.jobType === 'Flex' ? it.flexHeight || null : null,
          flex_unit: it.jobType === 'Flex' ? it.flexUnit : null,
          quantity: Number(it.quantity),
          rate: Number(it.rate),
          total_amount: lineTotal(it),
          is_urgent: form.isUrgent,
          assigned_to: form.assignedTo.trim() || null,
          needs_design: it.needsDesign,
          needs_printing: it.needsPrinting,
          production_stage: stage,
          payment_type: form.paymentType,
          status: 'Pending',
          delivery_date: form.deliveryDate || null,
          delivery_time: form.deliveryTime || null,
          notes: form.notes.trim() || null
        }).select('id, total_amount').single()
        if (jErr) throw jErr
        created.push(job)

        // tell the team that gets this item first that new work has arrived
        const tgt = stage === 'Design Queue' ? 'design' : stage === 'Print Queue' ? 'print' : null
        if (tgt) notifs.push({
          job_id: job.id, job_code: jobCode, customer_name: name,
          event: tgt === 'design' ? 'New design job arrived' : 'New printing job arrived',
          actor: 'owner', target: tgt
        })
      }
      if (notifs.length) await supabase.from('activity_log').insert(notifs)

      // 4. spread the money received now across the jobs (oldest first)
      let remaining = paidNowNum
      const payVia = isCredit ? form.paidVia : form.paymentType
      for (const job of created) {
        if (remaining <= 0) break
        const applied = Math.min(remaining, Number(job.total_amount))
        if (applied > 0) {
          await supabase.from('payments').insert({
            job_id: job.id, amount: applied, payment_type: payVia,
            notes: isCredit ? 'Advance at order creation' : 'Paid at order creation'
          })
          remaining -= applied
        }
      }

      localStorage.removeItem(DRAFT_KEY)
      window.dispatchEvent(new Event('idhayam:refresh-notifs'))
      toast.success(created.length > 1 ? `${created.length} jobs created` : 'Job created')
      navigate(`/order/${orderGroup}`)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Could not save order')
    } finally {
      setBusy(false)
    }
  }

  const steps = ['Customer', 'Job Details', 'Payment']

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl text-ink">New Job</h1>
        <p className="text-sm text-ink-300">Add one or more items for the customer — your draft is auto-saved.</p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center">
        {steps.map((label, i) => {
          const n = i + 1
          const active = step === n
          const done = step > n
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                  ${done ? 'bg-leaf text-white' : active ? 'bg-press text-white' : 'bg-ink-50 text-ink-300'}`}>
                  {done ? '✓' : n}
                </div>
                <span className={`mt-1.5 text-[11px] font-semibold ${active ? 'text-press' : 'text-ink-300'}`}>{label}</span>
              </div>
              {n < steps.length && (
                <div className={`flex-1 h-1 mx-2 rounded-full ${step > n ? 'bg-leaf' : 'bg-ink-50'}`} />
              )}
            </div>
          )
        })}
      </div>

      <div className="card">
        <AnimatePresence mode="wait">
          {/* STEP 1 */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-4">
              <div className="relative">
                <label className="label">Customer Name *</label>
                <input className="input" placeholder="Start typing…" value={form.customerName}
                  autoComplete="off" autoCorrect="off" spellCheck={false}
                  onChange={(e) => { set('customerName', e.target.value); setShowSuggest(true) }}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 150)} />
                {showSuggest && suggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-cardHover border border-ink-50 overflow-hidden">
                    {suggestions.map((c) => (
                      <button key={c.id} type="button"
                        onMouseDown={() => { set('customerName', c.name); set('whatsapp', c.contact || ''); set('additionalContact', c.alt_contact || ''); set('place', c.place || ''); setShowSuggest(false) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-ink-50 text-sm">
                        <span className="font-medium text-charcoal">{c.name}</span>
                        {c.place && <span className="text-press ml-2 text-xs">· {c.place}</span>}
                        {c.contact && <span className="text-ink-300 ml-2 text-xs font-mono">{c.contact}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="label">WhatsApp Number</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#25D366]"><WhatsAppIcon className="w-5 h-5" /></span>
                  <input className="input pl-10 font-mono" placeholder="WhatsApp number" value={form.whatsapp}
                    autoComplete="off" inputMode="numeric"
                    onChange={(e) => set('whatsapp', e.target.value)} />
                </div>
                <p className="text-[11px] text-ink-300 mt-1">Order confirmation will be sent to this number.</p>
              </div>
              <div>
                <label className="label">Additional Number (optional)</label>
                <input className="input font-mono" placeholder="Alternate number" value={form.additionalContact}
                  autoComplete="off" inputMode="numeric"
                  onChange={(e) => set('additionalContact', e.target.value)} />
              </div>
              <div>
                <label className="label">Place / Area (optional)</label>
                <input className="input" placeholder="e.g. Kalaiyarkovil, Karaikudi…" value={form.place}
                  autoComplete="off"
                  onChange={(e) => set('place', e.target.value)} />
                <p className="text-[11px] text-ink-300 mt-1">Helps tell apart customers with the same name.</p>
              </div>
            </motion.div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-4">
              {form.items.map((it, i) => (
                <div key={i} className="rounded-xl border border-ink-100 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Item {i + 1}</span>
                    {form.items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)}
                        className="text-xs font-semibold text-press hover:underline">Remove</button>
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
                    <div>
                      <label className="label">Custom Job Type *</label>
                      <input className="input" placeholder="Type the job type" value={it.customJobType}
                        onChange={(e) => setItem(i, 'customJobType', e.target.value)} />
                    </div>
                  )}

                  {it.jobType === 'Flex' && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="label">Width</label>
                        <input type="number" className="input font-mono" value={it.flexWidth}
                          onChange={(e) => setItem(i, 'flexWidth', e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Height</label>
                        <input type="number" className="input font-mono" value={it.flexHeight}
                          onChange={(e) => setItem(i, 'flexHeight', e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Unit</label>
                        <select className="input" value={it.flexUnit} onChange={(e) => setItem(i, 'flexUnit', e.target.value)}>
                          <option value="ft">ft</option>
                          <option value="inches">inches</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label">Paper Size</label>
                    <select className="input" value={it.paperSize} onChange={(e) => setItem(i, 'paperSize', e.target.value)}>
                      <option value="">Select size…</option>
                      {PAPER_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {it.paperSize === 'Other' && (
                    <div>
                      <label className="label">Custom Paper Size *</label>
                      <input className="input" value={it.customPaperSize}
                        onChange={(e) => setItem(i, 'customPaperSize', e.target.value)} />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Quantity *</label>
                      <input type="number" className="input font-mono" value={it.quantity}
                        onChange={(e) => setItem(i, 'quantity', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Rate per unit (₹) *</label>
                      <input type="number" className="input font-mono" value={it.rate}
                        onChange={(e) => setItem(i, 'rate', e.target.value)} />
                    </div>
                  </div>

                  {/* Production stages this item needs (drives the Design / Print boards) */}
                  <div>
                    <label className="label">Work needed</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setItem(i, 'needsDesign', !it.needsDesign)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${it.needsDesign ? 'bg-press text-white border-press' : 'bg-white text-ink-300 border-ink-100 hover:bg-ink-50'}`}>
                        {it.needsDesign ? '✓ ' : ''}Design
                      </button>
                      <button type="button" onClick={() => setItem(i, 'needsPrinting', !it.needsPrinting)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${it.needsPrinting ? 'bg-ink text-white border-ink' : 'bg-white text-ink-300 border-ink-100 hover:bg-ink-50'}`}>
                        {it.needsPrinting ? '✓ ' : ''}Printing
                      </button>
                    </div>
                    <p className="text-[11px] text-ink-300 mt-1">Turn off a stage this item doesn't need (e.g. printing-only or design-only).</p>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-300">Item total</span>
                    <span className="font-mono font-semibold text-leaf">{formatINR(lineTotal(it))}</span>
                  </div>
                </div>
              ))}

              <button type="button" onClick={addItem} className="btn-outline w-full">+ Add another job type</button>

              <div className="card bg-leaf/5 flex items-center justify-between">
                <span className="label mb-0">Grand Total</span>
                <span className="font-mono font-bold text-leaf text-xl">{formatINR(total)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Expected Delivery Date</label>
                  <input type="date" className="input" value={form.deliveryDate}
                    onChange={(e) => set('deliveryDate', e.target.value)} />
                </div>
                <div>
                  <label className="label">Delivery Time (optional)</label>
                  <TimePicker value={form.deliveryTime} onChange={(v) => set('deliveryTime', v)} />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input min-h-[80px]" placeholder="Optional" value={form.notes}
                  onChange={(e) => set('notes', e.target.value)} />
              </div>

              <button type="button" onClick={() => set('isUrgent', !form.isUrgent)}
                className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 transition-colors
                  ${form.isUrgent ? 'border-press bg-press/5' : 'border-ink-100 bg-white hover:bg-ink-50'}`}>
                <span className="flex items-center gap-2">
                  <span className="text-lg">⚡</span>
                  <span className="text-left">
                    <span className="block font-semibold text-charcoal">Mark as Urgent</span>
                    <span className="block text-[11px] text-ink-300">Applies to all items in this order</span>
                  </span>
                </span>
                <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${form.isUrgent ? 'bg-press' : 'bg-ink-100'}`}>
                  <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isUrgent ? 'translate-x-5' : ''}`} />
                </span>
              </button>

              <div>
                <label className="label">Assign to Employee (optional)</label>
                <input className="input" placeholder="Employee name" value={form.assignedTo}
                  onChange={(e) => set('assignedTo', e.target.value)} />
                <p className="text-[11px] text-ink-300 mt-1">Applies to all items · you can reassign individually from the Job Board.</p>
              </div>
            </motion.div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-5">
              <div>
                <label className="label">Payment Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Cash', 'UPI', 'Credit'].map((t) => (
                    <button key={t} type="button" onClick={() => set('paymentType', t)}
                      className={`btn ${form.paymentType === t ? 'bg-ink text-white' : 'btn-outline'}`}>{t}</button>
                  ))}
                </div>
                {!isCredit && (
                  <p className="text-xs text-leaf mt-2 font-medium">✓ Fully paid — {formatINR(total)} received via {form.paymentType}.</p>
                )}
              </div>

              {isCredit && (
                <div className="rounded-xl border border-ink-100 bg-paper p-4 space-y-4">
                  <div>
                    <label className="label">Amount paying now (advance)</label>
                    <input type="number" className="input font-mono" placeholder="0" max={total}
                      value={form.paidNow} onChange={(e) => set('paidNow', e.target.value)} />
                    <div className="flex gap-3 mt-1.5">
                      <button type="button" onClick={() => set('paidNow', '0')} className="text-[11px] font-semibold text-ink-300 hover:text-ink">Nothing now</button>
                      <button type="button" onClick={() => set('paidNow', String(total))} className="text-[11px] font-semibold text-ink-300 hover:text-ink">Paying full</button>
                    </div>
                  </div>
                  {paidNowNum > 0 && (
                    <div>
                      <label className="label">Received via</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['Cash', 'UPI'].map((t) => (
                          <button key={t} type="button" onClick={() => set('paidVia', t)}
                            className={`btn text-sm ${form.paidVia === t ? 'bg-ink text-white' : 'btn-outline'}`}>{t}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-sm"><span className="text-ink-300">Total</span><span className="font-mono">{formatINR(total)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-ink-300">Paid now</span><span className="font-mono font-semibold text-leaf">{formatINR(paidNowNum)}</span></div>
                    <div className="flex items-center justify-between pt-2 border-t border-ink-100"><span className="font-semibold text-press">Pending Credit</span><span className="font-mono font-bold text-press">{formatINR(pendingNum)}</span></div>
                  </div>
                </div>
              )}

              <div className="card bg-paper space-y-2.5">
                <h3 className="font-heading font-bold text-ink mb-1">Order Summary</h3>
                <SummaryRow label="Customer" value={form.customerName} />
                {form.place && <SummaryRow label="Place" value={form.place} />}
                {form.whatsapp && <SummaryRow label="WhatsApp" value={form.whatsapp} />}

                <div className="pt-2 border-t border-ink-50 space-y-1.5">
                  {form.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-charcoal">
                        {resolveType(it) || '—'}
                        <span className="text-ink-300"> × {it.quantity || 0}</span>
                      </span>
                      <span className="font-mono">{formatINR(lineTotal(it))}</span>
                    </div>
                  ))}
                </div>

                <SummaryRow label="Payment" value={isCredit ? `Credit · paid ${formatINR(paidNowNum)} now (${form.paidVia})` : `${form.paymentType} · fully paid`} />
                {form.isUrgent && <SummaryRow label="Priority" value="⚡ Urgent" />}
                <div className="pt-2 mt-1 border-t border-ink-100 flex items-center justify-between">
                  <span className="font-semibold text-ink">Grand Total</span>
                  <span className="font-mono font-bold text-leaf text-xl">{formatINR(total)}</span>
                </div>
                {isCredit && pendingNum > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-press">Pending Credit</span>
                    <span className="font-mono font-bold text-press text-lg">{formatINR(pendingNum)}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nav buttons */}
        <div className="flex items-center justify-between mt-6 pt-5 border-t border-ink-50">
          <button className="btn-ghost" onClick={step === 1 ? () => navigate('/') : back} disabled={busy}>
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < 3 ? (
            <button className="btn-primary" onClick={next}>Next →</button>
          ) : (
            <button className="btn-accent" onClick={handleConfirm} disabled={busy}>
              {busy ? 'Saving…' : 'Confirm & Generate Invoice'}
            </button>
          )}
        </div>
      </div>

      {/* Same-person / different-person prompt (shown only when there's an ambiguity) */}
      <AnimatePresence>
        {pending && (
          <motion.div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPending(null)}>
            <motion.div
              className="bg-paper w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-panel overflow-hidden"
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="bg-ink text-white px-5 py-4">
                <div className="font-heading font-bold text-lg leading-tight">
                  {pending.kind === 'phoneOther' ? 'Number already in use'
                    : pending.kind === 'nameNewNumber' ? 'Same customer, new number?'
                    : 'Which customer is this?'}
                </div>
              </div>

              <div className="p-5 space-y-3">
                <p className="text-sm text-ink-300">
                  {pending.kind === 'phoneOther' && (
                    <>The number <span className="font-mono text-charcoal">{pending.phone}</span> already belongs to <span className="font-semibold text-charcoal">{pending.owner.name}</span>{pending.owner.place ? ` · ${pending.owner.place}` : ''}.</>
                  )}
                  {pending.kind === 'nameNewNumber' && (
                    <>You entered the number <span className="font-mono text-charcoal">{pending.phone}</span> for <span className="font-semibold text-charcoal">"{pending.name}"</span>, but that doesn't match the saved number.</>
                  )}
                  {pending.kind === 'nameNoNumber' && (
                    <>There's already a customer named <span className="font-semibold text-charcoal">"{pending.name}"</span> and no number was entered. Who is this?</>
                  )}
                </p>

                {/* Case 2 — number belongs to someone else */}
                {pending.kind === 'phoneOther' && (
                  <>
                    <ChoiceBtn primary
                      onClick={() => choose({ customerId: pending.owner.id })}
                      title={`Same person — add this job to ${pending.owner.name}`}
                      sub="Keeps all their history & dues together" />
                    <ChoiceBtn
                      onClick={() => choose({ customerId: 'new' })}
                      title={`Different person sharing this number`}
                      sub={`Create a new customer "${pending.name}"`} />
                  </>
                )}

                {/* Case 1 — known name, new number */}
                {pending.kind === 'nameNewNumber' && (
                  <>
                    {pending.matches.map((m) => (
                      <ChoiceBtn key={m.id} primary
                        onClick={() => choose({ customerId: m.id, updateContactTo: pending.phone })}
                        title={`Same person — update ${m.name}'s number`}
                        sub={`${m.place ? m.place + ' · ' : ''}old: ${m.contact || '—'} → new: ${pending.phone}`} />
                    ))}
                    <ChoiceBtn
                      onClick={() => choose({ customerId: 'new' })}
                      title="Different person"
                      sub={`Create a new customer "${pending.name}"`} />
                  </>
                )}

                {/* Case 5 — existing name(s), no number */}
                {pending.kind === 'nameNoNumber' && (
                  <>
                    {pending.matches.map((m) => (
                      <ChoiceBtn key={m.id} primary
                        onClick={() => choose({ customerId: m.id })}
                        title={`This is ${m.name}`}
                        sub={`${m.place ? m.place + ' · ' : ''}${m.contact || 'no number'}`} />
                    ))}
                    <ChoiceBtn
                      onClick={() => choose({ customerId: 'new' })}
                      title="None of these"
                      sub={`Create a new customer "${pending.name}"`} />
                  </>
                )}

                <button onClick={() => setPending(null)}
                  className="w-full text-center text-sm font-semibold text-ink-300 hover:text-ink py-2">
                  ← Back to edit
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ChoiceBtn({ onClick, title, sub, primary }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left rounded-xl border px-4 py-3 transition-colors
        ${primary ? 'border-press bg-press/5 hover:bg-press/10' : 'border-ink-100 bg-white hover:bg-ink-50'}`}>
      <div className={`text-sm font-semibold ${primary ? 'text-press' : 'text-charcoal'}`}>{title}</div>
      {sub && <div className="text-[11px] text-ink-300 mt-0.5">{sub}</div>}
    </button>
  )
}

function SummaryRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-300">{label}</span>
      <span className={`text-charcoal font-medium ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}
