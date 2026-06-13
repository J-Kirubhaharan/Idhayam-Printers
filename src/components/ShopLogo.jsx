import { useState } from 'react'

// Shows the shop logo from /logo.png. If the file is missing, falls back to
// the "IP" monogram so the invoice never looks broken.
export default function ShopLogo({ size = 104, className = '' }) {
  const [err, setErr] = useState(false)

  if (err) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-2xl bg-ink flex items-center justify-center shrink-0 ${className}`}
      >
        <span className="font-heading font-extrabold text-white" style={{ fontSize: size * 0.36 }}>IP</span>
      </div>
    )
  }

  return (
    <img
      src="/logo.png"
      alt="Idhayam Printers"
      onError={() => setErr(true)}
      style={{ width: size, height: size }}
      className={`object-contain shrink-0 ${className}`}
    />
  )
}
