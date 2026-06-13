// Indian number formatting (1,00,000 instead of 100,000)
const inrFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
})
const inrFmt2 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export const formatINR = (n, withPaise = false) => {
  const num = Number(n) || 0
  return (withPaise ? inrFmt2 : inrFmt).format(num)
}

export const formatNumberIN = (n) =>
  new Intl.NumberFormat('en-IN').format(Number(n) || 0)

// DD/MM/YYYY
export const formatDate = (input) => {
  if (!input) return '-'
  const d = new Date(input)
  if (isNaN(d.getTime())) return '-'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  return `${dd}/${mm}/${yy}`
}

// DD/MM/YYYY HH:mm IST
export const formatDateTime = (input) => {
  if (!input) return '-'
  const d = new Date(input)
  if (isNaN(d.getTime())) return '-'
  const date = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' })
  const time = d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  return `${date} ${time}`
}

// YYYY-MM-DD in IST (Chennai). en-CA gives the YYYY-MM-DD format directly,
// and the timeZone option makes it correct on any computer's clock settings.
export const todayIST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

// "HH:MM" (24h) -> "h:MM AM/PM"
export const formatTime12 = (t) => {
  if (!t) return ''
  const [hStr, m] = String(t).split(':')
  let h = Number(hStr)
  if (isNaN(h)) return t
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${(m || '00').padStart(2, '0')} ${ampm}`
}

// Combine a YYYY-MM-DD date and optional HH:MM time into a Date (IST).
export const deliveryDeadline = (dateStr, timeStr) => {
  if (!dateStr) return null
  const t = timeStr && /^\d{1,2}:\d{2}/.test(timeStr) ? timeStr : '23:59'
  const d = new Date(`${dateStr}T${t.length === 4 ? '0' + t : t}:00+05:30`)
  return isNaN(d.getTime()) ? null : d
}

// Derived payment status, based purely on how much has actually been paid
// versus the total — independent of the payment type label. This way an edit
// that raises the total (or any underpayment) correctly shows a balance.
export const paymentStatusOf = (job, paid = 0) => {
  const total = Number(job?.total_amount) || 0
  if (total <= 0) return 'Paid'
  if (paid >= total - 0.01) return 'Paid'
  if (paid > 0) return 'Partial'
  return 'Pending'
}

export const startOfDayISO = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00+05:30`)
  return d.toISOString()
}
export const endOfDayISO = (dateStr) => {
  const d = new Date(`${dateStr}T23:59:59.999+05:30`)
  return d.toISOString()
}
