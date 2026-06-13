import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import toast from 'react-hot-toast'

const links = [
  { to: '/', key: 'nav.dashboard', icon: '■' },
  { to: '/new-job', key: 'nav.newJob', icon: '+' },
  { to: '/quotation', key: 'nav.quotation', icon: '🧾' },
  { to: '/jobs', key: 'nav.existingJobs', icon: '☰' },
  { to: '/completed-jobs', key: 'nav.completedJobs', icon: '✓' },
  { to: '/job-board', key: 'nav.jobBoard', icon: '▦' },
  { to: '/deleted-jobs', key: 'nav.deletedJobs', icon: '🗑' },
  { to: '/customers', key: 'nav.customers', icon: '○' },
  { to: '/credit', key: 'nav.credit', icon: '₹' },
  { to: '/expenses', key: 'nav.expenses', icon: '−' },
  { to: '/daily-summary', key: 'nav.dailySummary', icon: '◐' },
  { to: '/reports', key: 'nav.reports', icon: '▲' }
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
              <span className="w-6 inline-flex justify-center text-base">{l.icon}</span>
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

function Logo() {
  // Placeholder logo: monogram in a rounded square
  return (
    <div className="w-10 h-10 rounded-xl bg-press flex items-center justify-center shadow-md flex-shrink-0">
      <span className="font-heading font-extrabold text-white text-lg leading-none">IP</span>
    </div>
  )
}
