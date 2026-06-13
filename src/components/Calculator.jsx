import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const calc = (a, b, op) => {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return b === 0 ? NaN : a / b
    default: return b
  }
}

// trim long floats so the display stays readable
const fmt = (n) => {
  if (!isFinite(n)) return 'Error'
  const r = Math.round((n + Number.EPSILON) * 1e8) / 1e8
  return String(r)
}

export default function Calculator() {
  const [open, setOpen] = useState(false)
  const [display, setDisplay] = useState('0')
  const [prev, setPrev] = useState(null)
  const [op, setOp] = useState(null)
  const [waiting, setWaiting] = useState(false)
  const ref = useRef(null)

  const clearAll = () => { setDisplay('0'); setPrev(null); setOp(null); setWaiting(false) }

  const inputDigit = useCallback((d) => {
    setDisplay((cur) => {
      if (waiting) { setWaiting(false); return d }
      return cur === '0' ? d : cur + d
    })
  }, [waiting])

  const inputDot = useCallback(() => {
    setDisplay((cur) => {
      if (waiting) { setWaiting(false); return '0.' }
      return cur.includes('.') ? cur : cur + '.'
    })
  }, [waiting])

  const backspace = () => setDisplay((cur) => (cur.length > 1 ? cur.slice(0, -1) : '0'))

  const percent = () => setDisplay((cur) => fmt(parseFloat(cur) / 100))

  const performOp = useCallback((nextOp) => {
    const val = parseFloat(display)
    if (prev === null) {
      setPrev(val)
    } else if (op && !waiting) {
      const result = calc(prev, val, op)
      setPrev(result)
      setDisplay(fmt(result))
    }
    setOp(nextOp)
    setWaiting(true)
  }, [display, prev, op, waiting])

  const equals = useCallback(() => {
    if (op === null || prev === null) return
    const val = parseFloat(display)
    const result = calc(prev, val, op)
    setDisplay(fmt(result))
    setPrev(null)
    setOp(null)
    setWaiting(true)
  }, [display, prev, op])

  // close when clicking outside
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // keyboard support while open
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key >= '0' && e.key <= '9') { inputDigit(e.key); e.preventDefault() }
      else if (e.key === '.') { inputDot(); e.preventDefault() }
      else if (['+', '-', '*', '/'].includes(e.key)) { performOp(e.key); e.preventDefault() }
      else if (e.key === 'Enter' || e.key === '=') { equals(); e.preventDefault() }
      else if (e.key === 'Backspace') { backspace(); e.preventDefault() }
      else if (e.key === '%') { percent(); e.preventDefault() }
      else if (e.key === 'Escape') { setOpen(false) }
      else if (e.key.toLowerCase() === 'c') { clearAll() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, inputDigit, inputDot, performOp, equals])

  const Btn = ({ label, onClick, variant = 'num', span }) => {
    const styles = {
      num: 'bg-white hover:bg-ink-50 text-charcoal',
      fn: 'bg-ink-50 hover:bg-ink-100 text-ink-600',
      op: 'bg-ink hover:bg-ink-600 text-white',
      eq: 'bg-press hover:bg-press-dark text-white'
    }[variant]
    return (
      <button type="button" onClick={onClick}
        className={`${styles} ${span === 2 ? 'col-span-2' : ''} h-11 rounded-xl font-semibold text-lg transition-colors active:scale-95`}>
        {label}
      </button>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} title="Calculator"
        className="w-10 h-10 rounded-xl bg-white border border-ink-100 shadow-card flex items-center justify-center hover:bg-ink-50 transition-colors text-lg">
        🧮
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 z-50 w-64 bg-paper rounded-2xl shadow-cardHover border border-ink-50 p-3"
          >
            <div className="bg-ink text-white rounded-xl px-4 py-3 mb-3 text-right">
              {op && prev !== null && (
                <div className="text-[11px] text-ink-200 font-mono h-3">{fmt(prev)} {op}</div>
              )}
              <div className="font-mono font-bold text-2xl leading-tight truncate">{display}</div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Btn label="C" variant="fn" onClick={clearAll} />
              <Btn label="⌫" variant="fn" onClick={backspace} />
              <Btn label="%" variant="fn" onClick={percent} />
              <Btn label="÷" variant="op" onClick={() => performOp('/')} />

              <Btn label="7" onClick={() => inputDigit('7')} />
              <Btn label="8" onClick={() => inputDigit('8')} />
              <Btn label="9" onClick={() => inputDigit('9')} />
              <Btn label="×" variant="op" onClick={() => performOp('*')} />

              <Btn label="4" onClick={() => inputDigit('4')} />
              <Btn label="5" onClick={() => inputDigit('5')} />
              <Btn label="6" onClick={() => inputDigit('6')} />
              <Btn label="−" variant="op" onClick={() => performOp('-')} />

              <Btn label="1" onClick={() => inputDigit('1')} />
              <Btn label="2" onClick={() => inputDigit('2')} />
              <Btn label="3" onClick={() => inputDigit('3')} />
              <Btn label="+" variant="op" onClick={() => performOp('+')} />

              <Btn label="0" span={2} onClick={() => inputDigit('0')} />
              <Btn label="." onClick={inputDot} />
              <Btn label="=" variant="eq" onClick={equals} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
