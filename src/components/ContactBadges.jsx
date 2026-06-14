// Small colourful icon badges used in the invoice footer band.
// Inline styles + plain SVG so they render reliably in the html2canvas PDF export.

function Badge({ from, to, children }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '22px',
        height: '22px',
        borderRadius: '7px',
        background: `linear-gradient(135deg, ${from}, ${to})`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        flexShrink: 0
      }}>
      {children}
    </span>
  )
}

const svg = (paths) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
    stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
)

export function PhoneBadge() {
  return (
    <Badge from="#34d399" to="#059669">
      {svg(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />)}
    </Badge>
  )
}

export function PinBadge() {
  return (
    <Badge from="#fb7185" to="#e11d48">
      {svg(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>)}
    </Badge>
  )
}

export function MailBadge() {
  return (
    <Badge from="#60a5fa" to="#2563eb">
      {svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>)}
    </Badge>
  )
}
