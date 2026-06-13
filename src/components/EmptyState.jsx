export default function EmptyState({ icon = '📭', title, message, action }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-5xl mb-3 opacity-70">{icon}</div>
      <div className="font-heading font-semibold text-ink text-lg mb-1">{title}</div>
      {message && <div className="text-sm text-ink-300 max-w-sm mx-auto mb-4">{message}</div>}
      {action}
    </div>
  )
}
