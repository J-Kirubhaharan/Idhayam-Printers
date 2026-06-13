import { motion } from 'framer-motion'

export default function StatCard({ label, value, accent = 'ink', sub, icon }) {
  const accentMap = {
    ink: 'text-ink',
    press: 'text-press',
    leaf: 'text-leaf',
    amber: 'text-amber_warn'
  }
  const bgMap = {
    ink: 'bg-ink-50',
    press: 'bg-press/10',
    leaf: 'bg-leaf/10',
    amber: 'bg-amber_warn/15'
  }
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="card card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-1.5">{label}</div>
          <div className={`font-mono font-semibold text-2xl sm:text-3xl ${accentMap[accent]} truncate`}>{value}</div>
          {sub && <div className="text-xs text-ink-300 mt-1">{sub}</div>}
        </div>
        {icon && (
          <div className={`shrink-0 w-10 h-10 rounded-xl ${bgMap[accent]} ${accentMap[accent]} flex items-center justify-center text-lg font-bold`}>
            {icon}
          </div>
        )}
      </div>
    </motion.div>
  )
}
