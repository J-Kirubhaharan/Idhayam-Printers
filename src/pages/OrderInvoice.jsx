import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { Skeleton } from '../components/Skeleton'
import WhatsAppButton from '../components/WhatsAppButton'
import { buildOrderGroupMessage } from '../lib/whatsapp'
import InvoiceSheet, { billNoOf } from '../components/InvoiceSheet'

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
    // Wait for fonts to load
    if (document.fonts?.ready) {
      await document.fonts.ready
    }

    // Wait for logo/images to load
    const images = printRef.current.querySelectorAll('img')
    await Promise.all(
      Array.from(images).map((img) => {
        if (img.complete) return Promise.resolve()
        return new Promise((resolve) => {
          img.onload = resolve
          img.onerror = resolve
        })
      })
    )

    await new Promise((resolve) => setTimeout(resolve, 300))

    const canvas = await html2canvas(printRef.current, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: printRef.current.scrollWidth,
      windowHeight: printRef.current.scrollHeight,

      // Download-only alignment fixes
      onclone: (clonedDoc) => {
        const brandText = clonedDoc.querySelector('.pdf-brand-text')
        if (brandText) {
          brandText.style.transform = 'translateY(-14px)'
          brandText.style.display = 'inline-block'
        }

        const invoiceTitle = clonedDoc.querySelector('.pdf-invoice-title')
        if (invoiceTitle) {
          invoiceTitle.style.transform = 'translateY(-10px)'
          invoiceTitle.style.display = 'inline-block'
        }

        clonedDoc.querySelectorAll('.pdf-footer-text').forEach((el) => {
          el.style.transform = 'translateY(-7px)'
          el.style.display = 'inline-block'
          el.style.lineHeight = '1'
        })
      },
    })
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
  const billNo = billNoOf(jobs[0]?.job_id)

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

      {/* Printable — fixed A4 sheet so the PDF fills the whole page */}
      <div className="overflow-x-auto">
        <div className="shadow-card mx-auto w-[794px]">
          <InvoiceSheet jobs={jobs} paid={paid} innerRef={printRef} />
        </div>
      </div>

      <div className="no-print text-center">
        <button className="btn-ghost" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    </div>
  )
}
