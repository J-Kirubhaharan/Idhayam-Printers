import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Clock from './Clock'
import TimePicker, { labelFor } from './TimePicker'

const STORE = 'idhayam_alarms'
const MUTE = 'idhayam_chime_muted'
const QUICK = [5, 10, 15, 30, 45, 60]

const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || [] } catch { return [] } }
const save = (a) => localStorage.setItem(STORE, JSON.stringify(a))
const uid = () => `${Date.now()}-${Math.round(performance.now() * 1000) % 100000}`

// build the epoch ms a fixed "HH:MM" alarm should next fire at (today, else tomorrow)
const nextAlarmAt = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
  return d.getTime()
}

const fmtRemain = (ms) => {
  if (ms < 0) ms = 0
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  return `${m}:${String(ss).padStart(2, '0')}`
}

// pleasant 3-note arpeggio via Web Audio (no asset file needed)
let audioCtx = null
const playChime = () => {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const t0 = audioCtx.currentTime
    ;[880, 1108.73, 1318.51].forEach((f, i) => {
      const o = audioCtx.createOscillator()
      const g = audioCtx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      o.connect(g); g.connect(audioCtx.destination)
      const t = t0 + i * 0.16
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
      o.start(t); o.stop(t + 0.5)
    })
  } catch { /* audio not available */ }
}

export default function AlarmCenter() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('timer')
  const [alarms, setAlarms] = useState(load)        // scheduled, not yet fired
  const [firing, setFiring] = useState([])          // currently ringing (banner shown)
  const [nowMs, setNowMs] = useState(Date.now())
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE) === '1')

  // timer form
  const [mins, setMins] = useState('')
  const [timerNote, setTimerNote] = useState('')
  // alarm form
  const [atime, setAtime] = useState('')
  const [alarmNote, setAlarmNote] = useState('')

  const rootRef = useRef(null)
  const alarmsRef = useRef(alarms)

  useEffect(() => { save(alarms); alarmsRef.current = alarms }, [alarms])
  useEffect(() => { localStorage.setItem(MUTE, muted ? '1' : '0') }, [muted])

  // master tick: update countdowns + fire due alarms (side-effects kept OUT of the
  // state updaters, and firing is de-duped by id, so a timer can only fire once)
  useEffect(() => {
    const iv = setInterval(() => {
      const t = Date.now()
      setNowMs(t)
      const due = alarmsRef.current.filter((a) => a.fireAt <= t)
      if (!due.length) return
      setFiring((f) => {
        const seen = new Set(f.map((x) => x.id))
        const add = due.filter((d) => !seen.has(d.id))
        return add.length ? [...f, ...add] : f
      })
      setAlarms((prev) => prev.filter((a) => a.fireAt > t))
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  // ring while something is firing
  useEffect(() => {
    if (!firing.length || muted) return
    playChime()
    const iv = setInterval(playChime, 3000)
    return () => clearInterval(iv)
  }, [firing.length, muted])

  // close popover on outside click
  useEffect(() => {
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const addTimer = (m) => {
    const minutes = Number(m)
    if (!(minutes > 0)) return
    setAlarms((a) => [...a, {
      id: uid(), kind: 'timer', fireAt: Date.now() + minutes * 60000,
      label: minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`,
      note: timerNote.trim()
    }])
    setMins(''); setTimerNote('')
  }

  const addAlarm = () => {
    if (!atime) return
    setAlarms((a) => [...a, {
      id: uid(), kind: 'alarm', fireAt: nextAlarmAt(atime),
      label: labelFor(atime), note: alarmNote.trim()
    }])
    setAtime(''); setAlarmNote('')
  }

  const cancel = (id) => setAlarms((a) => a.filter((x) => x.id !== id))
  const dismiss = (id) => setFiring((f) => f.filter((x) => x.id !== id))
  const snooze = (item) => {
    setFiring((f) => f.filter((x) => x.id !== item.id))
    setAlarms((a) => [...a, { ...item, id: uid(), fireAt: Date.now() + 5 * 60000 }])
  }

  const count = alarms.length

  return (
    <div className="relative" ref={rootRef}>
      {/* Clickable clock with active badge */}
      <button onClick={() => setOpen((o) => !o)}
        className="relative block rounded-2xl transition-transform hover:scale-[1.02] active:scale-100 focus:outline-none focus:ring-2 focus:ring-press/40">
        <Clock />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1.5 rounded-full bg-gradient-to-br from-press to-press-dark text-white text-[11px] font-bold flex items-center justify-center shadow-md">
            {count}
          </span>
        )}
      </button>

      {/* Popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="absolute left-1/2 -translate-x-1/2 mt-3 z-50 w-[330px]"
          >
            <div className="rounded-3xl bg-white/95 backdrop-blur-xl shadow-panel border border-ink-50 overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 bg-gradient-to-r from-ink to-ink-700 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BellGlyph className="w-4 h-4" />
                  <span className="font-heading font-bold text-sm tracking-wide">Timer &amp; Alarm</span>
                </div>
                <button onClick={() => setMuted((m) => !m)}
                  title={muted ? 'Sound off' : 'Sound on'}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  {muted ? <SpeakerOff className="w-4 h-4" /> : <SpeakerOn className="w-4 h-4" />}
                </button>
              </div>

              {/* Tabs */}
              <div className="p-3">
                <div className="relative grid grid-cols-2 bg-paper rounded-2xl p-1">
                  <motion.div layout transition={{ type: 'spring', damping: 30, stiffness: 380 }}
                    className="absolute inset-y-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-card"
                    style={{ left: tab === 'timer' ? 4 : 'calc(50% + 0px)' }} />
                  {['timer', 'alarm'].map((tb) => (
                    <button key={tb} onClick={() => setTab(tb)}
                      className={`relative z-10 py-2 rounded-xl text-sm font-bold capitalize transition-colors ${tab === tb ? 'text-press' : 'text-ink-300'}`}>
                      {tb}
                    </button>
                  ))}
                </div>

                {/* TIMER */}
                {tab === 'timer' && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {QUICK.map((q) => (
                        <button key={q} onClick={() => addTimer(q)}
                          className="py-2.5 rounded-xl bg-gradient-to-br from-paper to-ink-50 hover:from-press/10 hover:to-press/5 border border-ink-50 text-sm font-bold text-charcoal transition-colors">
                          {q < 60 ? `${q}m` : `${q / 60}h`}
                        </button>
                      ))}
                    </div>
                    <input className="input" placeholder="Note (optional) — e.g. lamination ready"
                      value={timerNote} onChange={(e) => setTimerNote(e.target.value)} />
                    <div className="flex gap-2">
                      <input type="number" min="1" className="input font-mono flex-1" placeholder="Custom minutes"
                        value={mins} onChange={(e) => setMins(e.target.value)} />
                      <button onClick={() => addTimer(mins)} disabled={!(Number(mins) > 0)}
                        className="px-4 rounded-xl bg-press hover:bg-press-dark disabled:opacity-40 text-white text-sm font-bold transition-colors">
                        Start
                      </button>
                    </div>
                  </div>
                )}

                {/* ALARM */}
                {tab === 'alarm' && (
                  <div className="mt-3 space-y-3">
                    <TimePicker value={atime} onChange={setAtime} placeholder="Pick a time" />
                    <input className="input" placeholder="Note (optional) — e.g. call customer"
                      value={alarmNote} onChange={(e) => setAlarmNote(e.target.value)} />
                    <button onClick={addAlarm} disabled={!atime}
                      className="w-full py-2.5 rounded-xl bg-press hover:bg-press-dark disabled:opacity-40 text-white text-sm font-bold transition-colors">
                      Set alarm
                    </button>
                  </div>
                )}

                {/* Active list */}
                {count > 0 && (
                  <div className="mt-3 pt-3 border-t border-ink-50 space-y-2 max-h-48 overflow-y-auto">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-300">Active ({count})</div>
                    {alarms.slice().sort((a, b) => a.fireAt - b.fireAt).map((a) => (
                      <div key={a.id} className="flex items-center gap-2 bg-paper rounded-xl px-3 py-2">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 ${a.kind === 'timer' ? 'bg-leaf' : 'bg-ink'}`}>
                          {a.kind === 'timer' ? <SandGlyph className="w-3.5 h-3.5" /> : <BellGlyph className="w-3.5 h-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-charcoal font-mono leading-tight">{fmtRemain(a.fireAt - nowMs)}</div>
                          <div className="text-[11px] text-ink-300 truncate">{a.note || (a.kind === 'timer' ? `${a.label} timer` : `Alarm · ${a.label}`)}</div>
                        </div>
                        <button onClick={() => cancel(a.id)}
                          className="w-6 h-6 rounded-full hover:bg-ink-100 text-ink-300 hover:text-press flex items-center justify-center transition-colors shrink-0">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Firing banners (portal so they sit above everything) */}
      {createPortal(
        <div className="fixed top-4 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
          <AnimatePresence>
            {firing.map((item) => (
              <motion.div key={item.id}
                initial={{ opacity: 0, y: -40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                className="pointer-events-auto w-full max-w-md rounded-2xl shadow-panel overflow-hidden bg-gradient-to-r from-press to-press-dark text-white">
                <div className="flex items-center gap-3 px-4 py-3">
                  <motion.span
                    animate={{ rotate: [0, -18, 18, -12, 12, 0] }}
                    transition={{ duration: 1, repeat: Infinity, repeatDelay: 0.3 }}
                    className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <BellGlyph className="w-5 h-5" />
                  </motion.span>
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-bold leading-tight">
                      {item.kind === 'timer' ? "Time's up!" : 'Alarm'}
                      <span className="font-normal text-white/70 text-sm"> · {item.label}</span>
                    </div>
                    {item.note && <div className="text-sm text-white/90 truncate">{item.note}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => snooze(item)}
                      className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold transition-colors">+5 min</button>
                    <button onClick={() => dismiss(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-white text-press text-xs font-bold hover:bg-white/90 transition-colors">Dismiss</button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </div>
  )
}

/* ---- inline glyphs ---- */
function BellGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}
function SandGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L13 12l3.4-4.4a2 2 0 0 0 .6-1.4V2M7 22v-4.2a2 2 0 0 1 .6-1.4L11 12 7.6 7.6A2 2 0 0 1 7 6.2V2" />
    </svg>
  )
}
function SpeakerOn({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
    </svg>
  )
}
function SpeakerOff({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="m22 9-6 6M16 9l6 6" />
    </svg>
  )
}
