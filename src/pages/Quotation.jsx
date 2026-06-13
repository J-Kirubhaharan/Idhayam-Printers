import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate, todayIST } from '../lib/format'
import ShopLogo from '../components/ShopLogo'

const SHOP = {
  name: 'Idhayam Printers',
  address: 'Police Station Stop, Kalaiyarkovil - 626745',
  phones: '+91 63818 40450 · +91 99420 24958',
  email: 'idhayamoffsetkkoil@gmail.com'
}

const DEFAULT_TYPES = [
  'Banner', 'Flex', 'Poster', 'Pamphlet/Flyer', 'Brochure', 'Visiting Card',
  'Letter Head', 'ID Card', 'Sticker', 'Calendar', 'Book Printing', 'Binding',
  'Notebook', 'Bill Book', 'Invoice Book', 'Certificate', 'Envelope', 'Stamp',
  'Receipt Book', 'Files & Folders'
]

const emptyItem = () => ({ jobType: '', customJobType: '', size: '', qty: '', rate: '' })
const resolveType = (it) => it.jobType === 'Other' ? (it.customJobType || '').trim() : it.jobType

export default function Quotation() {
  const navigate = useNavigate()
  const printRef = useRef(null)
  const [downloading, setDownloading] = useState(false)

  const [shopName, setShopName] = useState('')      // customer's shop/business (optional)
  const [customerName, setCustomerName] = useState('')
  const [contact, setContact] = useState('')
  const [date, setDate] = useState(todayIST())
  const [validUntil, setValidUntil] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [discount, setDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [jobTypes, setJobTypes] = useState(DEFAULT_TYPES)

  // load job types (defaults + any custom ones that became permanent), like New Job
  useEffect(() => {
    supabase.from('job_types').select('name').order('name').then(({ data }) => {
      if (data?.length) {
        const names = data.map((x) => x.name)
        const extras = names.filter((n) => !DEFAULT_TYPES.includes(n))
        setJobTypes([...DEFAULT_TYPES.filter((n) => names.includes(n)), ...extras])
      }
    })
  }, [])

  // simple date-based quotation number, generated once
  const [quoteNo] = useState(() => {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `QT-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
  })

  const updateItem = (i, key, val) => setItems(items.map((it, idx) => idx === i ? { ...it, [key]: val } : it))
  const addItem = () => setItems([...items, emptyItem()])
  const removeItem = (i) => setItems(items.length > 1 ? items.filter((_, idx) => idx !== i) : items)

  const lineTotal = (it) => (Number(it.qty) || 0) * (Number(it.rate) || 0)
  const validItems = useMemo(
    () => items.filter((it) => resolveType(it) || lineTotal(it) > 0),
    [items]
  )
  const subtotal = useMemo(() => validItems.reduce((s, it) => s + lineTotal(it), 0), [validItems])
  const discountAmt = Number(discount) || 0
  const grandTotal = Math.max(0, subtotal - discountAmt)

  const handlePrint = () => window.print()

  const handleDownload = async () => {
    if (!printRef.current) return
    if (validItems.length === 0) return toast.error('Add at least one item')
    setDownloading(true)
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const img = canvas.toDataURL('image/jpeg', 0.95)
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width
      // Fill the page edge-to-edge; only add pages if it's meaningfully taller than one page.
      pdf.addImage(img, 'JPEG', 0, 0, imgW, imgH)
      let heightLeft = imgH - pageH
      let position = 0
      while (heightLeft > 5) {
        position -= pageH
        pdf.addPage()
        pdf.addImage(img, 'JPEG', 0, position, imgW, imgH)
        heightLeft -= pageH
      }
      pdf.save(`${quoteNo}.pdf`)
      toast.success('Quotation downloaded')
    } catch (e) {
      console.error(e)
      toast.error('Could not generate PDF')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="no-print flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-ink">Quotation</h1>
          <p className="text-sm text-ink-300">Build a price estimate and download it as a PDF</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={handlePrint}>🖨 Print</button>
          <button className="btn-accent" onClick={handleDownload} disabled={downloading}>
            {downloading ? 'Generating…' : '⬇ Download PDF'}
          </button>
        </div>
      </div>

      {/* ---------- Builder form ---------- */}
      <div className="no-print card space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Shop / Business Name (optional)</label>
            <input className="input" placeholder="e.g. Sri Bala Stores" value={shopName}
              onChange={(e) => setShopName(e.target.value)} />
          </div>
          <div>
            <label className="label">Customer Name</label>
            <input className="input" placeholder="Contact person" value={customerName}
              onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label className="label">Contact Number (optional)</label>
            <input className="input font-mono" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Valid Till</label>
              <input type="date" className="input" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div>
          <label className="label">Items</label>
          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="space-y-2">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <select className="input col-span-4" value={it.jobType}
                    onChange={(e) => updateItem(i, 'jobType', e.target.value)}>
                    <option value="">Job type…</option>
                    {jobTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                    <option value="Other">Other…</option>
                  </select>
                  <input className="input col-span-3" placeholder="Size"
                    value={it.size} onChange={(e) => updateItem(i, 'size', e.target.value)} />
                  <input type="number" className="input col-span-2 font-mono" placeholder="Qty"
                    value={it.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} />
                  <input type="number" className="input col-span-2 font-mono" placeholder="Rate"
                    value={it.rate} onChange={(e) => updateItem(i, 'rate', e.target.value)} />
                  <button type="button" onClick={() => removeItem(i)}
                    className="col-span-1 text-ink-300 hover:text-press text-lg leading-none disabled:opacity-30"
                    disabled={items.length === 1} title="Remove">✕</button>
                </div>
                {it.jobType === 'Other' && (
                  <input className="input" placeholder="Enter custom job type"
                    value={it.customJobType} onChange={(e) => updateItem(i, 'customJobType', e.target.value)} />
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addItem} className="btn-outline mt-2 text-sm">+ Add item</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Discount (₹, optional)</label>
            <input type="number" className="input font-mono" placeholder="0" value={discount}
              onChange={(e) => setDiscount(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Notes / Terms (optional)</label>
          <textarea className="input min-h-[70px]" placeholder="e.g. 50% advance, delivery in 3 days…"
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {/* ---------- Printable quotation — A4 sheet matching the template ---------- */}
      <div className="overflow-x-auto">
      <div id="invoice-printable" ref={printRef}
        className="bg-white shadow-card mx-auto flex flex-col"
        style={{ width: '794px', minHeight: '1123px' }}>

        {/* Top: big logo + shop name (left), small QUOTATION (right) */}
        <div className="px-10 pt-10 flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <ShopLogo size={96} />
            <div>
              <div className="font-heading font-extrabold text-3xl text-ink leading-none">Idhayam</div>
              <div className="text-base tracking-[0.28em] text-press font-bold mt-1">PRINTERS</div>
            </div>
          </div>
          <h1 className="font-heading font-extrabold text-4xl text-ink-300 leading-none tracking-tight shrink-0">QUOTATION</h1>
        </div>

        {/* Subject line (the customer's shop / business) */}
        {shopName && (
          <div className="px-10 mt-3 text-[15px]">
            <span className="font-bold text-press">PREPARED FOR: </span>
            <span className="text-charcoal font-medium">{shopName}</span>
          </div>
        )}

        {/* Bill To + totals */}
        <div className="px-10 mt-8 grid grid-cols-2 gap-10">
          <div>
            <div className="text-sm text-gray-500">Bill To:</div>
            <div className="font-heading font-bold text-xl text-press mt-0.5">{customerName || shopName || '—'}</div>
            {contact && <div className="text-sm text-gray-500 font-mono mt-1">{contact}</div>}
            <div className="border-t border-gray-300 mt-3" />
          </div>
          <div className="text-sm">
            <div className="text-right">
              <div className="text-gray-500">Total Due:</div>
              <div className="font-heading font-bold text-2xl text-press">{formatINR(grandTotal)}</div>
            </div>
            <div className="border-t border-gray-300 my-3" />
            <div className="flex justify-between gap-4 py-0.5"><span className="text-gray-500">Quotation #</span><span className="font-medium text-charcoal">{quoteNo}</span></div>
            <div className="flex justify-between gap-4 py-0.5"><span className="text-gray-500">Date</span><span className="font-medium text-charcoal">{formatDate(date)}</span></div>
            {validUntil && <div className="flex justify-between gap-4 py-0.5"><span className="text-gray-500">Valid Till</span><span className="font-medium text-charcoal">{formatDate(validUntil)}</span></div>}
          </div>
        </div>

        {/* Items table */}
        <div className="px-10 mt-9">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-charcoal border-b-2 border-charcoal">
                <th className="text-left font-bold px-2 py-2.5 uppercase tracking-wide text-xs">Description</th>
                <th className="text-center font-bold px-2 py-2.5 uppercase tracking-wide text-xs w-16">Qty</th>
                <th className="text-right font-bold px-2 py-2.5 uppercase tracking-wide text-xs">Unit Price</th>
                <th className="text-right font-bold px-2 py-2.5 uppercase tracking-wide text-xs">Total</th>
              </tr>
            </thead>
            <tbody>
              {validItems.length === 0 ? (
                <tr><td colSpan={4} className="px-2 py-8 text-center text-gray-400">Add items in the form above</td></tr>
              ) : validItems.map((it, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="px-2 py-3.5 align-top">
                    <div className="font-bold text-charcoal">{resolveType(it) || '—'}</div>
                    {it.size && <div className="text-xs text-gray-500 mt-0.5">{it.size}</div>}
                  </td>
                  <td className="px-2 py-3.5 text-center font-mono align-top">{it.qty || 0}</td>
                  <td className="px-2 py-3.5 text-right font-mono align-top">{formatINR(it.rate || 0)}</td>
                  <td className="px-2 py-3.5 text-right font-mono font-semibold align-top">{formatINR(lineTotal(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="px-10 mt-6 flex justify-end">
          <div className="w-72 text-sm">
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Sub Total</span>
              <span className="font-mono">{formatINR(subtotal)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between py-1.5">
                <span className="text-press">Discount</span>
                <span className="font-mono text-press">- {formatINR(discountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-2.5 border-t-2 border-charcoal mt-1">
              <span className="font-heading font-bold text-charcoal">GRAND TOTAL</span>
              <span className="font-mono font-bold text-charcoal text-lg">{formatINR(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Terms & Conditions */}
        {notes && (
          <div className="px-10 mt-9">
            <div className="font-heading font-bold text-press mb-1.5">Terms &amp; Conditions</div>
            <div className="text-xs text-gray-500 leading-relaxed max-w-md whitespace-pre-wrap">{notes}</div>
          </div>
        )}

        {/* Thank you */}
        <div className="px-10 mt-9">
          <div className="font-heading font-bold text-press tracking-wide">THANK YOU FOR YOUR BUSINESS!</div>
          <div className="border-t border-gray-300 mt-2 max-w-md" />
        </div>

        {/* Spacer pushes company info to the bottom */}
        <div className="flex-1" />

        {/* Company footer (bottom-left, like the template) */}
        <div className="px-10 pb-10 mt-8 text-xs text-gray-600 leading-relaxed">
          <div className="font-bold text-charcoal text-sm">{SHOP.name}</div>
          <div>{SHOP.address}</div>
          <div>{SHOP.phones}</div>
          <div>{SHOP.email}</div>
        </div>
      </div>
      </div>

      <div className="no-print text-center">
        <button className="btn-ghost" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    </div>
  )
}
