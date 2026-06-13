import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute() {
  const { session, role, loading } = useAuth()
  // Wait until both the session and (if logged in) the role are resolved,
  // so employees never briefly see the owner UI.
  if (loading || (session && role === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-ink-400 text-sm">Loading…</div>
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
