import { Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Sidebar from './Sidebar'
import AlarmCenter from './AlarmCenter'
import Notifications from './Notifications'
import LangToggle from './LangToggle'
import Calculator from './Calculator'
import GlobalSearch from './GlobalSearch'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LanguageContext'

export default function Layout() {
  return (
    <div className="min-h-screen bg-paper flex">
      <Sidebar />
      <main className="flex-1 min-w-0 lg:pl-64">
        {/* Live clock + active-work counter, centered; notifications bell top-right */}
        <div className="relative pt-16 lg:pt-6 px-4">
          <div className="flex flex-col items-center">
            <AlarmCenter />
            <ActiveCounter />
          </div>
          <div className="absolute right-4 top-16 lg:top-6 flex items-center gap-2">
            <GlobalSearch />
            <Calculator />
            <LangToggle />
            <Notifications />
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8 pt-4 max-w-[1400px] mx-auto"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  )
}

// Live count of active work: In Progress (green) and Pending / not started (red).
function ActiveCounter() {
  const { t } = useLang()
  const [counts, setCounts] = useState({ inProgress: 0, pending: 0 })

  const fetchCounts = async () => {
    const { data } = await supabase.from('job_board').select('status')
    const inProgress = (data || []).filter((j) => j.status === 'In Progress').length
    const pending = (data || []).filter((j) => j.status === 'Pending').length
    setCounts({ inProgress, pending })
  }

  useEffect(() => {
    fetchCounts()
    const ch = supabase
      .channel('layout_active_counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_board' }, () => fetchCounts())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  return (
    <div className="mt-3 flex items-center gap-6 text-base">
      <span className="inline-flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-leaf" />
        <span className="font-bold text-charcoal text-lg">{counts.inProgress}</span>
        <span className="text-ink-300">{t('counter.inProgress')}</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-press" />
        <span className="font-bold text-charcoal text-lg">{counts.pending}</span>
        <span className="text-ink-300">{t('counter.pending')}</span>
      </span>
    </div>
  )
}
