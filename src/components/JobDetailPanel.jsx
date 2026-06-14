import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate, formatDateTime, formatTime12, paymentStatusOf } from '../lib/format'
import StatusBadge, { PaymentBadge, PaymentStatusBadge } from './StatusBadge'
import ConfirmDialog from './ConfirmDialog'
import WhatsAppButton from './WhatsAppButton'
import TimePicker from './TimePicker'
import { buildOrderMessage, buildStatusMessage } from '../lib/whatsapp'
import { useLang } from '../context/LanguageContext'

const STATUSES = ['Pending', 'In Progress', 'Ready for Pickup', 'Delivered'] // delivery statuses

const DEFAULT_TYPES = [
  'Banner', 'Flex', 'Poster', 'Pamphlet/Flyer', 'Brochure', 'Visiting Card',
  'Letter Head', 'ID Card', 'Sticker', 'Calendar', 'Book Printing', 'Binding',
  'Notebook', 'Bill Book', 'Invoice Book', 'Certificate', 'Envelope', 'Stamp',
  'Receipt Book', 'Files & Folders'
]
const PAPER_SIZES = ['A3', 'A4', 'A5', 'A6', 'Other']

// the WhatsApp button label key for each delivery status
const WA_KEYS = {
  'Pending': 'jd.waPending',
  'In Progress': 'jd.waProgress',
  'Ready for Pickup': 'jd.waReady',
  'Delivered': 'jd.waDelivered'
}

export default function JobDetailPanel({ job, onClose, onChanged, onDuplicate }) {
  const navigate = useNavigate()
  const { t } = useLang()
  const [tab, setTab] = useState('details') // details | edit | payment
  const [busy, setBusy] = useState(false)
  const [payments, setPayments] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  // editable fields
  const [form, setForm] = useState(null)
  // payment fields
  const [payAmount, setPayAmount] = useState('')
  const [payType, setPayType] = useState('Cash')
  const [jobTypes, setJobTypes] = useState(DEFAULT_TYPES)

  // load job types (defaults + custom permanents) for the Edit tab dropdown
  useEffect(() => {
    supabase.from('job_types').select('name').order('name').then(({ data }) => {
      if (data?.length) {
        const names = data.map((x) => x.name)
        const extras = names.filter((n) => !DEFAULT_TYPES.includes(n))
        setJobTypes([...DEFAULT_TYPES.filter((n) => names.includes(n)), ...extras])
      }
    })
  }, [])

  useEffect(() => {
    if (!job) return
    setTab('details')
    setForm({
      status: job.status,
      quantity: job.quantity,
      rate: job.rate,
      delivery_date: job.delivery_date || '',
      delivery_time: job.delivery_time || '',
      notes: job.notes || '',
      is_urgent: !!job.is_urgent,
      design_assignee: job.design_assignee || '',
      print_assignee: job.print_assignee || '',
      customerName: job.customers?.name || '',
      contact: job.customers?.contact || '',
      altContact: job.customers?.alt_contact || '',
      place: job.customers?.place || '',
      jobType: job.job_type || '',
      customJobType: job.custom_job_type || '',
      paperSize: job.paper_size || '',
      customPaperSize: job.custom_paper_size || '',
      flexWidth: job.flex_width || '',
      flexHeight: job.flex_height || '',
      flexUnit: job.flex_unit || 'ft'
    })
    setPayAmount('')
    setPayType('Cash')
    loadPayments(job.id)
  }, [job])

  const loadPayments = async (id) => {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('job_id', id)
      .order('payment_date', { ascending: false })
    setPayments(data || [])
  }

  if (!job || !form) return null

  const customerName = job.customers?.name || '—'

  const setStatus = async (status) => {
    setBusy(true)
    const { error } = await supabase.from('jobs').update({ status }).eq('id', job.id)
    setBusy(false)
    if (error) return toast.error('Could not update status')
    toast.success(`Marked ${status}`)
    setForm((f) => ({ ...f, status }))
    onChanged?.()
  }

  const saveEdits = async () => {
    const qty = Number(form.quantity) || 0
    const rate = Number(form.rate) || 0
    if (!form.customerName.trim()) return toast.error('Customer name is required')
    if (!form.jobType) return toast.error('Select a job type')
    if (form.jobType === 'Other' && !form.customJobType.trim()) return toast.error('Enter the custom job type')
    if (form.paperSize === 'Other' && !form.customPaperSize.trim()) return toast.error('Enter the custom paper size')
    if (qty <= 0) return toast.error('Quantity must be greater than 0')
    setBusy(true)
    try {
      // detect what changed (excluding customer name/phone/place) so we can
      // notify whichever team currently holds the job
      const changes = []
      const oldType = job.job_type === 'Other' ? job.custom_job_type : job.job_type
      const newType = form.jobType === 'Other' ? form.customJobType.trim() : form.jobType
      if ((oldType || '') !== (newType || '')) changes.push('Job type')
      const oldPaper = job.paper_size === 'Other' ? job.custom_paper_size : job.paper_size
      const newPaper = form.paperSize === 'Other' ? form.customPaperSize.trim() : form.paperSize
      const oldFlex = job.job_type === 'Flex' ? `${job.flex_width || ''}x${job.flex_height || ''}${job.flex_unit || ''}` : ''
      const newFlex = form.jobType === 'Flex' ? `${form.flexWidth || ''}x${form.flexHeight || ''}${form.flexUnit || ''}` : ''
      if ((oldPaper || '') !== (newPaper || '') || oldFlex !== newFlex) changes.push('Size')
      if (Number(job.quantity) !== qty) changes.push('Quantity')
      if (Number(job.rate) !== rate) changes.push('Rate')
      if ((job.delivery_date || '') !== (form.delivery_date || '')) changes.push('Delivery date')
      if ((job.delivery_time || '') !== (form.delivery_time || '')) changes.push('Delivery time')
      if (!!job.is_urgent !== !!form.is_urgent) changes.push('Urgent')
      if ((job.design_assignee || '') !== (form.design_assignee?.trim() || '')) changes.push('Design assignee')
      if ((job.print_assignee || '') !== (form.print_assignee?.trim() || '')) changes.push('Print assignee')
      if ((job.notes || '') !== (form.notes || '')) changes.push('Notes')
      if (job.status !== form.status) changes.push('Status')

      // 1. update the job details
      const { error: jErr } = await supabase
        .from('jobs')
        .update({
          job_type: form.jobType,
          custom_job_type: form.jobType === 'Other' ? form.customJobType.trim() : null,
          paper_size: form.paperSize || null,
          custom_paper_size: form.paperSize === 'Other' ? form.customPaperSize.trim() : null,
          flex_width: form.jobType === 'Flex' ? (form.flexWidth || null) : null,
          flex_height: form.jobType === 'Flex' ? (form.flexHeight || null) : null,
          flex_unit: form.jobType === 'Flex' ? form.flexUnit : null,
          quantity: qty,
          rate,
          total_amount: qty * rate,
          delivery_date: form.delivery_date || null,
          delivery_time: form.delivery_time || null,
          notes: form.notes || null,
          status: form.status,
          is_urgent: form.is_urgent,
          design_assignee: form.design_assignee?.trim() || null,
          print_assignee: form.print_assignee?.trim() || null
        })
        .eq('id', job.id)
      if (jErr) throw jErr

      // 2. update the linked customer's name / numbers
      if (job.customer_id) {
        await supabase.from('customers').update({
          name: form.customerName.trim(),
          contact: form.contact.trim() || null,
          alt_contact: form.altContact.trim() || null,
          place: form.place.trim() || null
        }).eq('id', job.customer_id)
      }

      // 3. notify the team currently holding the job about the changes
      const stage = job.production_stage
      const target = ['Design Queue', 'Designing'].includes(stage) ? 'design'
        : ['Print Queue', 'Printing'].includes(stage) ? 'print' : null
      if (target && changes.length) {
        await supabase.from('activity_log').insert({
          job_id: job.id, job_code: job.job_id,
          customer_name: form.customerName.trim() || job.customers?.name || '-',
          event: `Updated: ${changes.join(', ')}`, actor: 'owner', target
        })
      }

      window.dispatchEvent(new Event('idhayam:refresh-notifs'))
      toast.success('Job updated')
      onChanged?.()
    } catch (e) {
      console.error(e)
      toast.error('Could not save changes')
    } finally {
      setBusy(false)
    }
  }

  const addPayment = async () => {
    const amount = Number(payAmount) || 0
    if (amount <= 0) return toast.error('Enter a valid amount')
    setBusy(true)
    const { error: payErr } = await supabase.from('payments').insert({
      job_id: job.id,
      amount,
      payment_type: payType
    })
    if (payErr) {
      setBusy(false)
      return toast.error('Could not record payment')
    }
    // payment status is derived from amount paid — no status field to update here
    setBusy(false)
    toast.success(`Payment of ${formatINR(amount)} recorded`)
    setPayAmount('')
    await loadPayments(job.id)
    onChanged?.()
  }

  // Soft delete: remove this job's payments, flag the job as deleted (keeps its
  // row so the Job ID is retired and it shows in the Deleted Jobs page).
  const deleteJob = async () => {
    setBusy(true)
    try {
      await supabase.from('payments').delete().eq('job_id', job.id)
      const { error } = await supabase
        .from('jobs')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', job.id)
      if (error) throw error

      // if this was the customer's only live job, remove the now-empty customer
      if (job.customer_id) {
        const { count } = await supabase
          .from('jobs').select('id', { count: 'exact', head: true })
          .eq('customer_id', job.customer_id).is('deleted_at', null)
        if (count === 0) await supabase.from('customers').delete().eq('id', job.customer_id)
      }

      toast.success(`${job.job_id} moved to Deleted Jobs`)
      setConfirmDelete(false)
      onChanged?.()
      onClose?.()
    } catch (e) {
      console.error(e)
      toast.error('Could not delete job')
    } finally {
      setBusy(false)
    }
  }

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const jobDiscount = Number(job.discount) || 0
  const jobNet = Math.max(0, Number(job.total_amount) - jobDiscount)
  const balance = Math.max(0, jobNet - totalPaid)

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.aside
          className="absolute top-0 right-0 h-full w-full max-w-md bg-paper shadow-panel flex flex-col"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-ink text-white px-5 py-4 flex items-start justify-between">
            <div>
              <div className="font-mono text-sm text-ink-100">{job.job_id}</div>
              <div className="font-heading font-bold text-lg leading-tight">{customerName}</div>
              <div className="text-[11px] text-ink-200">{job.customers?.contact || ''}</div>
            </div>
            <button onClick={onClose} className="text-xl leading-none text-ink-100 hover:text-white">✕</button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-ink-100 bg-white">
            {[
              ['details', t('jd.details')],
              ['edit', t('jd.edit')],
              ['payment', t('jd.payment')]
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  tab === key ? 'text-press border-b-2 border-press' : 'text-ink-300 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {tab === 'details' && (
              <>
                <div className="card space-y-3">
                  <Row label={t('jd.deliveryStatus')}><StatusBadge status={form.status} /></Row>
                  {form.is_urgent && <Row label={t('jd.priority')}><span className="pill bg-press text-white">⚡ URGENT</span></Row>}
                  {job.design_assignee && <Row label={t('assign.design')}><span className="pill bg-press text-white">👤 {job.design_assignee}</span></Row>}
                  {job.print_assignee && <Row label={t('assign.print')}><span className="pill bg-ink text-white">👤 {job.print_assignee}</span></Row>}
                  <Row label={t('jd.paymentStatus')}><PaymentStatusBadge status={paymentStatusOf(job, totalPaid)} /></Row>
                  <Row label={t('jd.paymentMethod')}><PaymentBadge type={job.payment_type} /></Row>
                  <Row label={t('field.jobType')}>{job.job_type === 'Other' ? job.custom_job_type : job.job_type}</Row>
                  <Row label={t('jd.paperSize')}>{job.paper_size === 'Other' ? job.custom_paper_size : job.paper_size || '—'}</Row>
                  {job.job_type === 'Flex' && (job.flex_width || job.flex_height) && (
                    <Row label={t('jd.dimensions')}>{job.flex_width} × {job.flex_height} {job.flex_unit}</Row>
                  )}
                  <Row label={t('field.quantity')}><span className="font-mono">{job.quantity}</span></Row>
                  <Row label={t('jd.rate')}><span className="font-mono">{formatINR(job.rate)}</span></Row>
                  {jobDiscount > 0 ? (
                    <>
                      <Row label={t('jd.total')}><span className="font-mono">{formatINR(job.total_amount)}</span></Row>
                      <Row label="Discount"><span className="font-mono text-press">− {formatINR(jobDiscount)}</span></Row>
                      <Row label="Net"><span className="font-mono font-semibold text-ink">{formatINR(jobNet)}</span></Row>
                    </>
                  ) : (
                    <Row label={t('jd.total')}><span className="font-mono font-semibold text-ink">{formatINR(job.total_amount)}</span></Row>
                  )}
                  {(job.payment_type === 'Credit' || totalPaid > 0) && (
                    <>
                      <Row label={t('jd.paid')}><span className="font-mono text-leaf">{formatINR(totalPaid)}</span></Row>
                      <Row label={t('jd.balance')}><span className={`font-mono font-semibold ${balance > 0 ? 'text-press' : 'text-leaf'}`}>{formatINR(balance)}</span></Row>
                    </>
                  )}
                  <Row label={t('field.delivery')}>{job.delivery_date ? `${formatDate(job.delivery_date)}${job.delivery_time ? ' · ' + formatTime12(job.delivery_time) : ''}` : '—'}</Row>
                  {job.status === 'Delivered' && job.delivered_at && (
                    <Row label={t('jd.deliveredOn')}><span className="text-leaf font-semibold">{formatDateTime(job.delivered_at)}</span></Row>
                  )}
                  <Row label={t('jd.created')}>{formatDateTime(job.created_at)}</Row>
                  {job.notes && (
                    <div className="pt-2 border-t border-ink-50">
                      <div className="label">{t('field.notes')}</div>
                      <div className="text-sm text-charcoal/80 whitespace-pre-wrap">{job.notes}</div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="label">{t('jd.quickStatus')}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        disabled={busy || form.status === s}
                        onClick={() => setStatus(s)}
                        className={`btn text-sm ${form.status === s ? 'bg-ink text-white' : 'btn-outline'}`}
                      >
                        {t(`status.${s}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <WhatsAppButton
                  number={job.customers?.contact}
                  message={form.status === 'Pending' ? buildOrderMessage(job) : buildStatusMessage(job, form.status)}
                  label={t(WA_KEYS[form.status] || 'jd.waDefault')}
                  className="btn w-full bg-[#25D366] text-white hover:bg-[#1faa52] disabled:opacity-50" />

                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-primary" onClick={() => navigate(job.order_group ? `/order/${job.order_group}` : `/invoice/${job.id}`)}>{t('jd.viewInvoice')}</button>
                  <button className="btn-outline" onClick={() => onDuplicate?.(job)}>{t('jd.duplicateJob')}</button>
                </div>

                <button
                  className="w-full text-sm font-semibold text-press hover:bg-press/5 py-2.5 rounded-xl transition-colors"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  {t('jd.deleteJob')}
                </button>
              </>
            )}

            {tab === 'edit' && (
              <div className="space-y-4">
                {/* Customer */}
                <div>
                  <label className="label">{t('jd.customerName')}</label>
                  <input className="input" value={form.customerName}
                    onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
                </div>
                <div>
                  <label className="label">{t('jd.place')}</label>
                  <input className="input" placeholder="e.g. Kalaiyarkovil, Karaikudi…" value={form.place}
                    onChange={(e) => setForm({ ...form, place: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{t('jd.whatsapp')}</label>
                    <input className="input font-mono" value={form.contact}
                      onChange={(e) => setForm({ ...form, contact: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">{t('jd.additional')}</label>
                    <input className="input font-mono" value={form.altContact}
                      onChange={(e) => setForm({ ...form, altContact: e.target.value })} />
                  </div>
                </div>

                {/* Job type */}
                <div>
                  <label className="label">{t('field.jobType')}</label>
                  <select className="input" value={form.jobType}
                    onChange={(e) => setForm({ ...form, jobType: e.target.value })}>
                    <option value="">{t('jd.selectType')}</option>
                    {jobTypes.map((jt) => <option key={jt} value={jt}>{jt}</option>)}
                    <option value="Other">{t('jd.other')}</option>
                  </select>
                </div>
                {form.jobType === 'Other' && (
                  <div>
                    <label className="label">{t('jd.customType')}</label>
                    <input className="input" value={form.customJobType}
                      onChange={(e) => setForm({ ...form, customJobType: e.target.value })} />
                  </div>
                )}

                {/* Flex dimensions */}
                {form.jobType === 'Flex' && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label">{t('jd.width')}</label>
                      <input type="number" className="input font-mono" value={form.flexWidth}
                        onChange={(e) => setForm({ ...form, flexWidth: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">{t('jd.height')}</label>
                      <input type="number" className="input font-mono" value={form.flexHeight}
                        onChange={(e) => setForm({ ...form, flexHeight: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">{t('jd.unit')}</label>
                      <select className="input" value={form.flexUnit}
                        onChange={(e) => setForm({ ...form, flexUnit: e.target.value })}>
                        <option value="ft">ft</option>
                        <option value="inches">inches</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Paper size */}
                <div>
                  <label className="label">{t('jd.paperSize')}</label>
                  <select className="input" value={form.paperSize}
                    onChange={(e) => setForm({ ...form, paperSize: e.target.value })}>
                    <option value="">{t('jd.selectSize')}</option>
                    {PAPER_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {form.paperSize === 'Other' && (
                  <div>
                    <label className="label">{t('jd.customSize')}</label>
                    <input className="input" value={form.customPaperSize}
                      onChange={(e) => setForm({ ...form, customPaperSize: e.target.value })} />
                  </div>
                )}

                {/* Quantity / Rate */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{t('field.quantity')}</label>
                    <input type="number" className="input font-mono" value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">{t('jd.rateRupee')}</label>
                    <input type="number" className="input font-mono" value={form.rate}
                      onChange={(e) => setForm({ ...form, rate: e.target.value })} />
                  </div>
                </div>
                <div className="card bg-leaf/5 flex items-center justify-between">
                  <span className="label mb-0">{t('jd.newTotal')}</span>
                  <span className="font-mono font-semibold text-leaf text-lg">
                    {formatINR((Number(form.quantity) || 0) * (Number(form.rate) || 0))}
                  </span>
                </div>

                {/* Delivery status + urgent + assign */}
                <div>
                  <label className="label">{t('jd.deliveryStatus')}</label>
                  <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                  </select>
                </div>

                <button type="button" onClick={() => setForm({ ...form, is_urgent: !form.is_urgent })}
                  className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 transition-colors
                    ${form.is_urgent ? 'border-press bg-press/5' : 'border-ink-100 bg-white hover:bg-ink-50'}`}>
                  <span className="flex items-center gap-2 font-semibold text-charcoal">⚡ {t('jd.urgent')}</span>
                  <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${form.is_urgent ? 'bg-press' : 'bg-ink-100'}`}>
                    <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_urgent ? 'translate-x-5' : ''}`} />
                  </span>
                </button>

                {job.needs_design && (
                  <div>
                    <label className="label">{t('assign.design')}</label>
                    <input className="input" placeholder={t('assign.namePlaceholder')}
                      value={form.design_assignee}
                      onChange={(e) => setForm({ ...form, design_assignee: e.target.value })} />
                  </div>
                )}
                {job.needs_printing && (
                  <div>
                    <label className="label">{t('assign.print')}</label>
                    <input className="input" placeholder={t('assign.namePlaceholder')}
                      value={form.print_assignee}
                      onChange={(e) => setForm({ ...form, print_assignee: e.target.value })} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{t('jd.deliveryDate')}</label>
                    <input type="date" className="input" value={form.delivery_date || ''}
                      onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">{t('jd.deliveryTime')}</label>
                    <TimePicker value={form.delivery_time || ''}
                      onChange={(v) => setForm({ ...form, delivery_time: v })} />
                  </div>
                </div>
                <div>
                  <label className="label">{t('field.notes')}</label>
                  <textarea className="input min-h-[90px]" value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <button className="btn-primary w-full" disabled={busy} onClick={saveEdits}>
                  {busy ? t('jd.saving') : t('jd.saveChanges')}
                </button>
              </div>
            )}

            {tab === 'payment' && (
              <div className="space-y-5">
                <div className="card space-y-2">
                  <Row label={t('jd.total')}><span className="font-mono">{formatINR(job.total_amount)}</span></Row>
                  {jobDiscount > 0 && <Row label="Discount"><span className="font-mono text-press">− {formatINR(jobDiscount)}</span></Row>}
                  <Row label={t('jd.paid')}><span className="font-mono text-leaf">{formatINR(totalPaid)}</span></Row>
                  <Row label={t('jd.balance')}><span className="font-mono font-semibold text-press">{formatINR(balance)}</span></Row>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="label">{t('jd.amountReceived')}</label>
                    <input type="number" className="input font-mono" placeholder="0"
                      value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">{t('jd.paymentType')}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Cash', 'UPI'].map((pt) => (
                        <button key={pt} type="button"
                          onClick={() => setPayType(pt)}
                          className={`btn text-sm ${payType === pt ? 'bg-ink text-white' : 'btn-outline'}`}>
                          {pt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-accent flex-1" disabled={busy} onClick={addPayment}>
                      {t('jd.recordPayment')}
                    </button>
                    <button className="btn-outline" disabled={busy}
                      onClick={() => { setPayAmount(String(balance)); }}>
                      {t('jd.full')} ({formatINR(balance)})
                    </button>
                  </div>
                </div>

                <div>
                  <div className="label">{t('jd.paymentHistory')}</div>
                  {payments.length === 0 ? (
                    <div className="text-sm text-ink-300">{t('jd.noPayments')}</div>
                  ) : (
                    <div className="space-y-2">
                      {payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-sm bg-white rounded-xl px-3 py-2 shadow-card">
                          <div>
                            <span className="font-mono font-semibold">{formatINR(p.amount)}</span>
                            <span className="ml-2 text-ink-300">{p.payment_type}</span>
                          </div>
                          <span className="text-xs text-ink-300">{formatDateTime(p.payment_date)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.aside>
      </motion.div>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={t('jd.deleteTitle')}
        message={`${job.job_id} (${customerName}) — ${t('jd.deleteMsg')}`}
        confirmText={t('jd.deleteConfirm')}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteJob}
      />
    </AnimatePresence>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-300">{label}</span>
      <span className="text-charcoal font-medium text-right">{children}</span>
    </div>
  )
}
