import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, session } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) return toast.error('Enter email and password')
    setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) {
      toast.error(error.message || 'Login failed')
      return
    }
    toast.success('Welcome back')
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-stretch bg-paper">
      {/* Brand panel */}
      <div className="hidden lg:flex w-1/2 bg-ink relative overflow-hidden ink-drop">
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="w-16 h-16 rounded-2xl bg-press flex items-center justify-center shadow-md mb-6">
            <span className="font-heading font-extrabold text-white text-2xl leading-none">IP</span>
          </div>
          <h1 className="font-heading font-extrabold text-4xl leading-tight mb-3">
            Idhayam<br />Printers
          </h1>
          <p className="text-ink-100 text-sm max-w-sm leading-relaxed">
            Job &amp; billing management — track jobs, customers, credit, expenses and
            daily cash, all in one place.
          </p>
          <div className="mt-10 space-y-1 text-[11px] text-ink-300">
            <div>Police Station Stop, Kalaiyarkovil · 626745</div>
            <div>+91 63818 40450 · +91 99420 24958</div>
            <div>idhayamoffsetkkoil@gmail.com</div>
          </div>
        </div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-press/20 blur-2xl" />
        <div className="absolute top-10 -left-16 w-72 h-72 rounded-full bg-ink-400/30 blur-2xl" />
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-press flex items-center justify-center shadow-md">
              <span className="font-heading font-extrabold text-white text-xl leading-none">IP</span>
            </div>
            <div>
              <div className="font-heading font-bold text-lg text-ink leading-tight">Idhayam</div>
              <div className="text-[11px] text-ink-300 leading-tight">Printers</div>
            </div>
          </div>

          <h2 className="font-heading font-bold text-2xl text-ink mb-1">Sign in</h2>
          <p className="text-sm text-ink-300 mb-6">Use the shop login to continue.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                autoComplete="username"
                className="input"
                placeholder="shop@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input pr-12"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-ink-300 hover:text-ink"
                >
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 text-[11px] text-ink-300 text-center">
            Session is remembered on this device.
          </div>
        </motion.div>
      </div>
    </div>
  )
}
