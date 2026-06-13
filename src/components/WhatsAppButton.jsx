import toast from 'react-hot-toast'
import WhatsAppIcon from './WhatsAppIcon'
import { buildOrderMessage, buildWhatsAppUrl, hasValidNumber } from '../lib/whatsapp'

// Opens WhatsApp (web/desktop on this computer) with the order confirmation
// pre-filled to the customer's number. Sends from whichever shop WhatsApp is
// logged in on the device.
export default function WhatsAppButton({ job, number, message, label = 'Send WhatsApp', className }) {
  const valid = hasValidNumber(number)

  const send = () => {
    if (!valid) return toast.error('No WhatsApp number saved for this customer')
    const text = message != null ? message : buildOrderMessage(job)
    const url = buildWhatsAppUrl(number, text)
    window.open(url, '_blank', 'noopener')
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={!valid}
      title={valid ? 'Send order confirmation on WhatsApp' : 'No WhatsApp number for this customer'}
      className={className || 'btn bg-[#25D366] text-white hover:bg-[#1faa52] disabled:opacity-50'}
    >
      <WhatsAppIcon className="w-4 h-4" />
      {label}
    </button>
  )
}
