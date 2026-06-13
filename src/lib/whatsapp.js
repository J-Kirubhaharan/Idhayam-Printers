import { formatDate, formatINR } from './format'

// Normalise a phone number for wa.me: digits only, with India country code.
//  - 10 digits           -> 91XXXXXXXXXX
//  - 0 + 10 digits       -> strip 0, add 91
//  - already has 91 / 12 -> kept as-is
export const normalizeWhatsApp = (raw) => {
  if (!raw) return ''
  let d = String(raw).replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10) d = '91' + d
  return d
}

export const hasValidNumber = (raw) => normalizeWhatsApp(raw).length >= 11

// Build the order-confirmation message: English first, then Tamil.
export const buildOrderMessage = (job) => {
  const name = job?.customers?.name || job?.customer_name || ''
  const jobType = job.job_type === 'Other' ? (job.custom_job_type || 'Job') : job.job_type
  const size = job.job_type === 'Flex' && (job.flex_width || job.flex_height)
    ? `${job.flex_width}×${job.flex_height} ${job.flex_unit || ''}`.trim()
    : (job.paper_size === 'Other' ? job.custom_paper_size : job.paper_size)
  const itemBits = [jobType, size].filter(Boolean).join(' ')
  const delivery = job.delivery_date ? formatDate(job.delivery_date) : null

  const en = [
    `Hi ${name}, your order at Idhayam Printers is confirmed.`,
    `Order: ${job.job_id}`,
    `Item: ${itemBits}, Qty ${job.quantity}`,
    delivery ? `Delivery: ${delivery}` : null,
    `Thank you!`
  ].filter(Boolean).join('\n')

  const ta = [
    `வணக்கம் ${name}, இதயம் பிரிண்டர்ஸில் உங்கள் ஆர்டர் உறுதி செய்யப்பட்டது.`,
    `ஆர்டர் எண்: ${job.job_id}`,
    `பொருள்: ${itemBits}, எண்ணிக்கை ${job.quantity}`,
    delivery ? `டெலிவரி தேதி: ${delivery}` : null,
    `நன்றி!`
  ].filter(Boolean).join('\n')

  return `${en}\n\n${ta}`
}

// Combined confirmation for a multi-item order (English first, then Tamil).
export const buildOrderGroupMessage = (jobs) => {
  const j0 = jobs[0] || {}
  const name = j0?.customers?.name || j0?.customer_name || ''
  const total = jobs.reduce((s, j) => s + Number(j.total_amount || 0), 0)
  const lines = jobs.map((j) => {
    const type = j.job_type === 'Other' ? (j.custom_job_type || 'Job') : j.job_type
    return `- ${type} x ${j.quantity}`
  })
  const en = [
    `Hi ${name}, your order at Idhayam Printers is confirmed.`,
    ...lines,
    `Total: ${formatINR(total)}`,
    `Thank you!`
  ].join('\n')
  const ta = [
    `வணக்கம் ${name}, இதயம் பிரிண்டர்ஸில் உங்கள் ஆர்டர் உறுதி செய்யப்பட்டது.`,
    ...lines,
    `மொத்தம்: ${formatINR(total)}`,
    `நன்றி!`
  ].join('\n')
  return `${en}\n\n${ta}`
}

// Status-update message (English first, then Tamil), chosen by delivery status.
// Falls back to the order confirmation for 'Pending'.
export const buildStatusMessage = (job, status = job?.status) => {
  const name = job?.customers?.name || job?.customer_name || ''
  const order = `Order: ${job.job_id}`
  const orderTa = `ஆர்டர் எண்: ${job.job_id}`
  let en, ta

  if (status === 'In Progress') {
    en = [
      `Hi ${name}, your order at Idhayam Printers has started and is now in progress.`,
      order,
      `We'll let you know once it's ready. Thank you!`
    ]
    ta = [
      `வணக்கம் ${name}, இதயம் பிரிண்டர்ஸில் உங்கள் வேலை தொடங்கிவிட்டது, தற்போது நடைபெற்று வருகிறது.`,
      orderTa,
      `தயாரானதும் தெரிவிக்கிறோம். நன்றி!`
    ]
  } else if (status === 'Ready for Pickup') {
    en = [
      `Hi ${name}, good news — your order at Idhayam Printers is finished and ready for pickup!`,
      order,
      `Please collect it at your convenience. Thank you!`
    ]
    ta = [
      `வணக்கம் ${name}, மகிழ்ச்சியான செய்தி — இதயம் பிரிண்டர்ஸில் உங்கள் வேலை முடிந்து எடுத்துச் செல்ல தயாராக உள்ளது!`,
      orderTa,
      `வசதியான நேரத்தில் வந்து பெற்றுக்கொள்ளவும். நன்றி!`
    ]
  } else if (status === 'Delivered') {
    en = [
      `Hi ${name}, your order from Idhayam Printers has been delivered.`,
      order,
      `Thank you for your order! We look forward to serving you again. Thank you so much!`
    ]
    ta = [
      `வணக்கம் ${name}, இதயம் பிரிண்டர்ஸில் இருந்து உங்கள் ஆர்டர் வழங்கப்பட்டுவிட்டது.`,
      orderTa,
      `உங்கள் ஆர்டருக்கு நன்றி! மீண்டும் எங்களிடம் வேலைகள் செய்ய வாருங்கள். மிக்க நன்றி!`
    ]
  } else {
    return buildOrderMessage(job)
  }

  return `${en.join('\n')}\n\n${ta.join('\n')}`
}

// Polite payment-reminder message: English first, then Tamil.
export const buildReminderMessage = (name, amount) => {
  const amt = formatINR(amount)
  const en = [
    `Hi ${name}, a gentle reminder from Idhayam Printers.`,
    `Your pending balance is ${amt}.`,
    `Kindly pay at your convenience. Thank you!`
  ].join('\n')

  const ta = [
    `வணக்கம் ${name}, இதயம் பிரிண்டர்ஸ் சார்பாக ஒரு பணிவான நினைவூட்டல்.`,
    `உங்கள் நிலுவைத் தொகை ${amt}.`,
    `தயவுசெய்து வசதியான நேரத்தில் செலுத்தவும். நன்றி!`
  ].join('\n')

  return `${en}\n\n${ta}`
}

export const buildWhatsAppUrl = (number, message) =>
  `https://wa.me/${normalizeWhatsApp(number)}?text=${encodeURIComponent(message)}`
