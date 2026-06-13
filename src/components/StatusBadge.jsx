import { useLang } from '../context/LanguageContext'

// Delivery (fulfillment) status
const map = {
  'Pending':          { dot: '🟡', cls: 'bg-amber_warn/15 text-amber_warn' },
  'In Progress':      { dot: '🔵', cls: 'bg-ink-100/60 text-ink' },
  'Ready for Pickup': { dot: '📦', cls: 'bg-[#0d9488]/15 text-[#0d9488]' },
  'Delivered':        { dot: '🟢', cls: 'bg-leaf/15 text-leaf' }
}

export default function StatusBadge({ status }) {
  const { t } = useLang()
  const m = map[status] || { dot: '·', cls: 'bg-ink-50 text-ink-400' }
  return (
    <span className={`pill ${m.cls}`}>
      <span className="mr-1.5 text-[10px]">{m.dot}</span>{t(`status.${status}`)}
    </span>
  )
}

// Payment method
export const PaymentBadge = ({ type }) => {
  const m = {
    Cash:   'bg-leaf/15 text-leaf',
    UPI:    'bg-ink-100/60 text-ink',
    Credit: 'bg-press/15 text-press'
  }[type] || 'bg-ink-50 text-ink-400'
  return <span className={`pill ${m}`}>{type}</span>
}

// Payment status (derived from amount paid)
export const PaymentStatusBadge = ({ status }) => {
  const { t } = useLang()
  const m = {
    Paid:    { dot: '✅', cls: 'bg-leaf/20 text-leaf' },
    Partial: { dot: '🟠', cls: 'bg-amber_warn/20 text-amber_warn' },
    Pending: { dot: '🔴', cls: 'bg-press/15 text-press' }
  }[status] || { dot: '·', cls: 'bg-ink-50 text-ink-400' }
  return (
    <span className={`pill ${m.cls}`}>
      <span className="mr-1.5 text-[10px]">{m.dot}</span>{t(`paystatus.${status}`)}
    </span>
  )
}
