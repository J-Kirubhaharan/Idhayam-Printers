import { formatINR, formatDate, formatTime12, formatTimeIST, paymentStatusOf } from '../lib/format'
import ShopLogo from './ShopLogo'
import { PhoneBadge, PinBadge, MailBadge } from './ContactBadges'

export const SHOP = {
  name: 'Idhayam Printers',
  address: 'Near Police Station, Kalaiyarkoil, Sivaganga - 630551, Tamil Nadu',
  phones: '+91 70949 46595 · +91 63818 40450 · +91 84281 08001',
  email: 'idhayamoffsetkkoil@gmail.com'
}

// the bill number is the shared base, e.g. IP-2026-011 (strip any -1/-2 item suffix)
export const billNoOf = (jobId) => {
  const p = (jobId || '').split('-')
  return p.length > 3 ? p.slice(0, 3).join('-') : (jobId || '')
}

// The printable A4 invoice sheet for one order (one or more item rows).
// Used by the single Invoice page and the bulk-download (merged PDF) page so
// both render identically. `innerRef` points at the sheet for html2canvas.
export default function InvoiceSheet({ jobs, paid = 0, innerRef }) {
  const cust = jobs[0]?.customers
  const billNo = billNoOf(jobs[0]?.job_id)
  const subTotal = jobs.reduce((s, j) => s + Number(j.total_amount), 0)
  const discount = jobs.reduce((s, j) => s + (Number(j.discount) || 0), 0)
  const grandTotal = Math.max(0, subTotal - discount)
  const balance = Math.max(0, grandTotal - paid)
  const payStatus = paymentStatusOf({ total_amount: grandTotal }, paid)

  const sizeOf = (j) => j.job_type === 'Flex' && (j.flex_width || j.flex_height)
    ? `${j.flex_width} × ${j.flex_height} ${j.flex_unit}`
    : (j.paper_size === 'Other' ? j.custom_paper_size : (j.paper_size || ''))
  const typeOf = (j) => j.job_type === 'Other' ? j.custom_job_type : j.job_type

  return (
    <div ref={innerRef} className="bg-white flex flex-col" style={{ width: '794px', minHeight: '1123px' }}>
      {/* Top: logo + shop name (left), INVOICE wordmark (right) */}
      <div className="px-9 pt-9 pb-7 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <ShopLogo size={120} />
          <div>
            <div className="font-heading font-extrabold text-5xl text-ink leading-none">IDHAYAM</div>
            <div className="text-2xl tracking-[0.28em] text-press font-bold mt-1">PRINTERS</div>
          </div>
        </div>
        <h1 className="font-heading font-extrabold text-5xl tracking-[0.18em] text-charcoal leading-none">INVOICE</h1>
      </div>

      {/* Parties + meta */}
      <div className="px-9 grid grid-cols-2 gap-8">
        <div>
          <div className="text-[11px] font-bold tracking-[0.18em] text-charcoal">INVOICE TO</div>
          <div className="font-heading font-extrabold text-2xl text-charcoal leading-tight mt-1">{cust?.name || '—'}</div>
          {cust?.place && <div className="text-sm text-gray-500 mt-0.5">{cust.place}</div>}
          <div className="mt-4 border-t border-gray-200 pt-3 text-sm space-y-0.5">
            <div className="font-semibold text-charcoal mb-1">Contact Person</div>
            {cust?.contact
              ? <div className="text-gray-500">Phone&nbsp;&nbsp;: {cust.contact}</div>
              : <div className="text-gray-400">Phone&nbsp;&nbsp;: —</div>}
            {cust?.alt_contact && <div className="text-gray-500">Alt&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: {cust.alt_contact}</div>}
          </div>
        </div>
        <div className="text-sm self-start">
          <MetaRow label="Invoice No" value={billNo} />
          <MetaRow label="Invoice Date" value={
            <span className="inline-flex flex-col items-end leading-tight">
              <span>{formatDate(jobs[0]?.created_at)}</span>
              <span className="text-gray-500 font-normal text-xs">{formatTimeIST(jobs[0]?.created_at)}</span>
            </span>
          } />
          <div className="border-t border-gray-200 my-3" />
          <MetaRow label="Payment Method" value={jobs[0]?.payment_type} />
          
          <MetaRow label="Payment Status" value={payStatus} />
        </div>
      </div>

      {/* Items table */}
      <div className="px-9 mt-7">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-charcoal text-white text-xs uppercase tracking-wide">
              <th className="text-left font-semibold px-4 py-3 w-10">#</th>
              <th className="text-left font-semibold px-4 py-3">Description</th>
              <th className="text-right font-semibold px-4 py-3">Rate</th>
              <th className="text-center font-semibold px-4 py-3">Qty</th>
              <th className="text-right font-semibold px-4 py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j, i) => (
              <tr key={j.id} className={i % 2 === 0 ? 'bg-[#efefef]' : 'bg-white'}>
                <td className="px-4 py-3.5 text-gray-500 align-top">{String(i + 1).padStart(2, '0')}</td>
                <td className="px-4 py-3.5 align-top">
                  <div className="font-semibold text-charcoal">{typeOf(j)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    <span className="font-mono">{j.job_id}</span>{sizeOf(j) ? ` · ${sizeOf(j)}` : ''}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right font-mono align-top">{formatINR(j.rate)}</td>
                <td className="px-4 py-3.5 text-center font-mono align-top">{j.quantity}</td>
                <td className="px-4 py-3.5 text-right font-mono font-semibold align-top">{formatINR(j.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="px-9 mt-8 grid grid-cols-2 gap-8 items-start">
        <div>
          <div className="text-sm font-semibold text-charcoal">Total Due</div>
          <div className="font-heading font-extrabold text-4xl text-charcoal mt-1">{formatINR(balance)}</div>
          <div className="border-t-2 border-charcoal w-44 mt-2" />
          <div className="text-xs text-gray-400 mt-2">
            {balance > 0 ? 'Balance payable on delivery' : 'Fully paid - Thank you!'}
          </div>
        </div>
        <div className="text-sm">
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="text-gray-500">Sub Total</span>
            <span className="font-mono">{formatINR(subTotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between py-2 border-b border-gray-200">
              <span className="text-gray-500">Discount</span>
              <span className="font-mono text-press">− {formatINR(discount)}</span>
            </div>
          )}
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="text-gray-500">Paid</span>
            <span className="font-mono text-leaf">{formatINR(paid)}</span>
          </div>
          <div className="flex justify-between items-center bg-charcoal text-white px-4 py-3 mt-2 rounded-md">
            <span className="font-bold tracking-wide">TOTAL</span>
            <span className="font-mono font-bold text-lg">{formatINR(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Notes are internal (for the job-board team) and intentionally NOT shown on the invoice */}

      <div className="flex-1" />

      {/* Footer band */}
      <div className="mt-9 bg-charcoal text-white px-9 py-5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2"><PhoneBadge /><span>{SHOP.phones}</span></div>
        <div className="flex items-center gap-2"><PinBadge /><span>{SHOP.address}</span></div>
        <div className="flex items-center gap-2"><MailBadge /><span>{SHOP.email}</span></div>
      </div>
    </div>
  )
}

function MetaRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-charcoal text-right">{value || '—'}</span>
    </div>
  )
}
