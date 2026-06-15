import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import toast from 'react-hot-toast'

const links = [
  { to: '/', key: 'nav.dashboard', icon: 'dashboard' },
  { to: '/new-job', key: 'nav.newJob', icon: 'plus' },
  { to: '/quotation', key: 'nav.quotation', icon: 'quote' },
  { to: '/jobs', key: 'nav.existingJobs', icon: 'list' },
  { to: '/completed-jobs', key: 'nav.completedJobs', icon: 'check' },
  { to: '/job-board', key: 'nav.jobBoard', icon: 'board' },
  { to: '/deleted-jobs', key: 'nav.deletedJobs', icon: 'trash' },
  { to: '/customers', key: 'nav.customers', icon: 'users' },
  { to: '/credit', key: 'nav.credit', icon: 'rupee' },
  { to: '/expenses', key: 'nav.expenses', icon: 'expense' },
  { to: '/add-old-record', key: 'nav.addOldRecord', icon: 'history' },
  { to: '/daily-summary', key: 'nav.dailySummary', icon: 'calendar' },
  { to: '/all-orders', key: 'nav.allOrders', icon: 'orders' },
  { to: '/invoices', key: 'nav.invoices', icon: 'invoice' },
  { to: '/reports', key: 'nav.reports', icon: 'reports' }
]

export default function Sidebar() {
  const [open, setOpen] = useState(false)
  const { signOut, user } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    toast.success('Signed out')
    navigate('/login')
  }

  return (
    <>
      {/* Mobile bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 bg-ink text-white px-4 h-14 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <Logo />
          <div className="font-heading font-bold tracking-wide">Idhayam</div>
        </div>
        <button onClick={() => setOpen(!open)} className="text-2xl leading-none">{open ? '✕' : '☰'}</button>
      </div>
      {open && <div className="lg:hidden h-14" />}

      <aside className={`
        fixed lg:fixed top-0 left-0 z-40 h-full w-64
        bg-ink text-white flex flex-col
        transition-transform duration-200 ease-out
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="px-5 pt-6 pb-5 border-b border-ink-700">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <div className="font-heading font-bold text-lg leading-tight">Idhayam</div>
              <div className="text-[11px] text-ink-200 leading-tight">Printers</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-colors duration-150
                ${isActive ? 'bg-press text-white shadow-md' : 'text-ink-100 hover:bg-ink-700'}
              `}
            >
              <span className="w-6 inline-flex justify-center"><Icon name={l.icon} /></span>
              {t(l.key)}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-ink-700">
          <div className="text-[11px] text-ink-200 mb-1.5">{t('common.signedInAs')}</div>
          <div className="text-xs text-white truncate mb-3">{user?.email || '—'}</div>
          <button
            onClick={handleLogout}
            className="w-full bg-press hover:bg-press-dark text-white text-sm font-semibold py-2 rounded-xl transition-colors"
          >
            {t('common.signOut')}
          </button>
          <div className="mt-3 text-[10px] text-ink-300 leading-relaxed">
            Shortcuts: <span className="text-ink-100">N</span> new job &middot; <span className="text-ink-100">E</span> existing
          </div>
        </div>
      </aside>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  )
}

// Consistent stroke icon set (Lucide-style), sized to the sidebar
function Icon({ name }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
    plus: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
    quote: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h8M8 9h2" /></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>,
    board: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 8v8M15 8v8" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" /><path d="M10 11v6M14 11v6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    rupee: <><path d="M6 3h12M6 8h12" /><path d="m6 13 8.5 8" /><path d="M6 13h3" /><path d="M9 13c6.667 0 6.667-10 0-10" /></>,
    expense: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" /></>,
    orders: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6M9 16h6" /></>,
    invoice: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    reports: <><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></>
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      {paths[name] || null}
    </svg>
  )
}

function Logo() {
  return (
    <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center overflow-hidden">
      <img
        src="/logo.png"
        alt="Idhayam Printers Logo"
        className="w-full h-full object-contain"
      />
    </div>
  )
}
