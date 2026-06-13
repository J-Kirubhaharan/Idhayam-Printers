import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// A modern 12-hour time picker. Stores/returns a 24-hour "HH:MM" string
// (same format as the native <input type="time">), so it's a drop-in replacement.

const to24 = (h12, min, ampm) => {
  let h = h12 % 12
  if (ampm === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

const parse = (value) => {
  if (!value) return { h12: 9, min: 0, ampm: 'AM' }
  const [hh, mm] = value.split(':').map(Number)
  const ampm = hh >= 12 ? 'PM' : 'AM'
  let h12 = hh % 12
  if (h12 === 0) h12 = 12
  return { h12, min: mm || 0, ampm }
}

export const labelFor = (value) => {
  if (!value) return ''
  const { h12, min, ampm } = parse(value)
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5) // 00, 05, … 55

export default function TimePicker({ value, onChange, placeholder = 'Select time' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { h12, min, ampm } = parse(value)

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const update = (nh, nm, na) => onChange(to24(nh, nm, na))

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="input flex items-center justify-between gap-2 text-left w-full">
        <span className={value ? 'text-charcoal font-medium' : 'text-ink-300'}>
          {value ? labelFor(value) : placeholder}
        </span>
        <svg className="w-4 h-4 text-ink-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-30 mt-1.5 w-full min-w-[260px] bg-white rounded-2xl shadow-cardHover border border-ink-50 p-3"
          >
            <div className="flex gap-2">
              {/* Hours */}
              <div className="flex-1">
                <div className="text-[10px] text-ink-300 text-center mb-1.5 uppercase tracking-wider font-semibold">Hour</div>
                <div className="h-40 overflow-y-auto rounded-xl bg-paper p-1 space-y-0.5 scroll-smooth">
                  {HOURS.map((h) => (
                    <button key={h} type="button" onClick={() => update(h, min, ampm)}
                      className={`w-full py-2 rounded-lg text-sm font-mono transition-colors ${value && h === h12 ? 'bg-press text-white font-bold' : 'hover:bg-ink-50 text-charcoal'}`}>
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              {/* Minutes */}
              <div className="flex-1">
                <div className="text-[10px] text-ink-300 text-center mb-1.5 uppercase tracking-wider font-semibold">Min</div>
                <div className="h-40 overflow-y-auto rounded-xl bg-paper p-1 space-y-0.5 scroll-smooth">
                  {MINUTES.map((m) => (
                    <button key={m} type="button" onClick={() => update(h12, m, ampm)}
                      className={`w-full py-2 rounded-lg text-sm font-mono transition-colors ${value && m === min ? 'bg-press text-white font-bold' : 'hover:bg-ink-50 text-charcoal'}`}>
                      {String(m).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>
              {/* AM / PM */}
              <div className="flex flex-col justify-center gap-2">
                {['AM', 'PM'].map((a) => (
                  <button key={a} type="button" onClick={() => update(h12, min, a)}
                    className={`px-3.5 py-2.5 rounded-xl text-sm font-bold transition-colors ${value && a === ampm ? 'bg-ink text-white shadow-md' : 'bg-paper hover:bg-ink-50 text-charcoal'}`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-ink-50">
              <button type="button" onClick={() => { onChange(''); setOpen(false) }}
                className="text-xs font-medium text-ink-300 hover:text-press transition-colors">Clear</button>
              <button type="button" onClick={() => setOpen(false)}
                className="text-xs font-bold text-press hover:underline">Done</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
