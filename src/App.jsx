import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewJob from './pages/NewJob'
import ExistingJobs from './pages/ExistingJobs'
import AllOrders from './pages/AllOrders'
import AddOldRecord from './pages/AddOldRecord'
import CompletedJobs from './pages/CompletedJobs'
import DeletedJobs from './pages/DeletedJobs'
import Invoice from './pages/Invoice'
import OrderInvoice from './pages/OrderInvoice'
import Customers from './pages/Customers'
import Credit from './pages/Credit'
import Expenses from './pages/Expenses'
import DailySummary from './pages/DailySummary'
import Reports from './pages/Reports'
import Quotation from './pages/Quotation'
import OwnerBoard from './pages/OwnerBoard'
import DesignBoard from './pages/DesignBoard'
import PrintBoard from './pages/PrintBoard'

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isDesign, isPrint } = useAuth()

  // Global keyboard shortcuts (owner only): N = new job, E = existing jobs
  useEffect(() => {
    if (isDesign || isPrint) return
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); navigate('/new-job') }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); navigate('/jobs') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, isDesign, isPrint])

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          {isDesign ? (
            <>
              <Route path="/design-board" element={<DesignBoard />} />
              <Route path="*" element={<Navigate to="/design-board" replace />} />
            </>
          ) : isPrint ? (
            <>
              <Route path="/print-board" element={<PrintBoard />} />
              <Route path="*" element={<Navigate to="/print-board" replace />} />
            </>
          ) : (
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/new-job" element={<NewJob />} />
              <Route path="/add-old-record" element={<AddOldRecord />} />
              <Route path="/quotation" element={<Quotation />} />
              <Route path="/jobs" element={<ExistingJobs />} />
              <Route path="/completed-jobs" element={<CompletedJobs />} />
              <Route path="/job-board" element={<OwnerBoard />} />
              <Route path="/deleted-jobs" element={<DeletedJobs />} />
              <Route path="/invoice/:jobId" element={<Invoice />} />
              <Route path="/order/:groupId" element={<OrderInvoice />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/credit" element={<Credit />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/daily-summary" element={<DailySummary />} />
              <Route path="/all-orders" element={<AllOrders />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          )}
        </Route>
      </Routes>
    </AnimatePresence>
  )
}
