import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR, formatDate, formatTime12, paymentStatusOf } from '../lib/format'
import { Skeleton } from '../components/Skeleton'
import WhatsAppButton from '../components/WhatsAppButton'
import { buildOrderGroupMessage } from '../lib/whatsapp'
import ShopLogo from '../components/ShopLogo'

const SHOP = {
  name: 'Idhayam Printers',
  address: 'Police Station Stop, Kalaiyarkovil - 626745',
  phones: '+91 63818 40450 · +91 99420 24958',
  email: 'idhayamoffsetkkoil@gmail.com'
}

export default function OrderInvoice() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const printRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState([])
  const [paid, setPaid] = useState(0)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => { load() }, [groupId])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('jobs').select('*, customers(name,contact,alt_contact,place)')
      .eq('order_group', groupId).is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (error || !data?.length) {
      toast.error('Order not found')
      navigate('/jobs')
      return
    }
    const ids = data.map((j) => j.id)
    const { data: pays } = await supabase.from('payments').select('amount').in('job_id', ids)
    setPaid((pays || []).reduce((s, p) => s + Number(p.amount), 0))
    setJobs(data)
    setLoading(false)
  }

  const handlePrint = () => window.print()

  const handleDownload = async () => {
    if (!printRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const img = canvas.toDataURL('image/jpeg', 0.95)
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width
      // Fill the page edge-to-edge. Only spill onto extra pages if the invoice is
      // meaningfully taller than one page (5mm tolerance avoids a blank 2nd page from rounding).
      pdf.addImage(img, 'JPEG', 0, 0, imgW, imgH)
      let heightLeft = imgH - pageH
      let position = 0
      while (heightLeft > 5) {
        position -= pageH
        pdf.addPage()
        pdf.addImage(img, 'JPEG', 0, position, imgW, imgH)
        heightLeft -= pageH
      }
      pdf.save(`${billNo || 'Order'}.pdf`)
      toast.success('Invoice downloaded')
    } catch (e) {
      console.error(e)
      toast.error('Could not generate PDF')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    )
  }

  const cust = jobs[0]?.customers
  // the bill number is the shared base, e.g. IPO-2026-011 (strip any -1/-2 item suffix)
  const billNo = (jobs[0]?.job_id || '').replace(/-\d+$/, '')
  const grandTotal = jobs.reduce((s, j) => s + Number(j.total_amount), 0)
  const balance = Math.max(0, grandTotal - paid)
  const payStatus = paymentStatusOf({ payment_type: jobs[0]?.payment_type, total_amount: grandTotal }, paid)

  const sizeOf = (j) => j.job_type === 'Flex' && (j.flex_width || j.flex_height)
    ? `${j.flex_width} × ${j.flex_height} ${j.flex_unit}`
    : (j.paper_size === 'Other' ? j.custom_paper_size : (j.paper_size || ''))
  const typeOf = (j) => j.job_type === 'Other' ? j.custom_job_type : j.job_type

  return (
    <div className="max-w-[860px] mx-auto space-y-5">
      {/* Toolbar */}
      <div className="no-print flex items-center justify-between flex-wrap gap-3">
        <button className="btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        <div className="flex gap-2 flex-wrap">
          <WhatsAppButton number={cust?.contact} message={buildOrderGroupMessage(jobs)} label="Send WhatsApp" />
          <button className="btn-outline" onClick={handlePrint}>🖨 Print</button>
          <button className="btn-accent" onClick={handleDownload} disabled={downloading}>
            {downloading ? 'Generating…' : '⬇ Download PDF'}
          </button>
        </div>
      </div>

      {/* Printable — fixed A4 sheet (794×1123px ≈ 210×297mm at 96dpi) so the PDF fills the whole page */}
      <div className="overflow-x-auto">
      <div id="invoice-printable" ref={printRef}
        className="bg-white shadow-card mx-auto flex flex-col"
        style={{ width: '794px', minHeight: '1123px' }}>
        {/* Top: logo + INVOICE wordmark */}
        <div className="px-9 pt-9 pb-7 flex items-start justify-between gap-6">
          <ShopLogo size={104} />
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
            <MetaRow label="Invoice Date" value={formatDate(jobs[0]?.created_at)} />
            <div className="border-t border-gray-200 my-3" />
            <MetaRow label="Payment Method" value={jobs[0]?.payment_type} />
            {jobs[0]?.delivery_date && (
              <MetaRow label="Delivery Date" value={`${formatDate(jobs[0].delivery_date)}${jobs[0].delivery_time ? ' · ' + formatTime12(jobs[0].delivery_time) : ''}`} />
            )}
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
              {balance > 0 ? 'Balance payable on delivery' : 'Fully paid — thank you!'}
            </div>
          </div>
          <div className="text-sm">
            <div className="flex justify-between py-2 border-b border-gray-200">
              <span className="text-gray-500">Sub Total</span>
              <span className="font-mono">{formatINR(grandTotal)}</span>
            </div>
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

        {jobs[0]?.notes && (
          <div className="px-9 mt-6">
            <div className="text-[11px] font-bold tracking-wide text-gray-400 uppercase">Notes</div>
            <div className="text-sm text-charcoal/80 whitespace-pre-wrap mt-1">{jobs[0].notes}</div>
          </div>
        )}

        {/* Spacer pushes the footer to the bottom of the A4 sheet */}
        <div className="flex-1" />

        {/* Footer band */}
        <div className="mt-9 bg-charcoal text-white px-9 py-5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2"><span>📞</span><span>{SHOP.phones}</span></div>
          <div className="flex items-center gap-2"><span>📍</span><span>{SHOP.address}</span></div>
          <div className="flex items-center gap-2"><span>✉️</span><span>{SHOP.email}</span></div>
        </div>
      </div>
      </div>

      <div className="no-print text-center">
        <button className="btn-ghost" onClick={() => navigate('/')}>Back to Dashboard</button>
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
