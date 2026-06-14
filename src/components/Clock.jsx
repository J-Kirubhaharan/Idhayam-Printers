import { useEffect, useState } from 'react'

// Live digital clock fixed to Chennai / India time (IST), 12-hour format.
export default function Clock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const time = now.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true
  })
  const [hms, ampm] = time.split(' ') // e.g. "09:05:03", "PM"

  const date = now.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  })

  return (
    <div className="inline-flex flex-col items-center rounded-2xl bg-white shadow-card px-7 py-2.5">
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono font-bold text-3xl tracking-tight text-ink tabular-nums">{hms}</span>
        <span className="font-mono text-sm font-bold text-press">{ampm}</span>
      </div>
      <div className="text-xs font-medium text-ink-400 mt-0.5">{date}</div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-ink-300 mt-0.5">Kalaiyarkoil</div>
    </div>
  )
}
