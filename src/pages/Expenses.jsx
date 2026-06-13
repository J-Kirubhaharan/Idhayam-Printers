import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { formatINR, formatDateTime, todayIST, startOfDayISO, endOfDayISO } from '../lib/format'
import StatCard from '../components/StatCard'
import { Skeleton, SkeletonCard } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'

const CATEGORIES = ['Tea/Snacks', 'Courier', 'Bus Parcel', 'Diesel/Petrol', 'Ink', 'Paper', 'Electricity', 'Maintenance', 'Salary', 'Other']

export default function Expenses() {
  const [loading, setLoading] = useState(true)
  const [expenses, setExpenses] = useState([])
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState(null)

  const [category, setCategory] = useState('Tea/Snacks')
  const [customCategory, setCustomCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayIST())

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(100)
    setExpenses(data || [])
    setLoading(false)
  }

  const todayTotal = useMemo(() => {
    const t = todayIST()
    return expenses
      .filter((e) => formatDateTime(e.created_at) && e.created_at.startsWith(t))
      .reduce((s, e) => s + Number(e.amount), 0)
  }, [expenses])

  const monthTotal = useMemo(() => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return expenses.filter((e) => (e.created_at || '').startsWith(ym)).reduce((s, e) => s + Number(e.amount), 0)
  }, [expenses])

  const save = async (e) => {
    e.preventDefault()
    const amt = Number(amount) || 0
    if (amt <= 0) return toast.error('Enter a valid amount')
    if (category === 'Other' && !customCategory.trim()) return toast.error('Enter the custom category')
    setBusy(true)
    // build a timestamp at noon IST on the chosen date so it lands on the right day
    const created_at = date === todayIST() ? new Date().toISOString() : `${date}T12:00:00+05:30`
    const { error } = await supabase.from('expenses').insert({
      category,
      custom_category: category === 'Other' ? customCategory.trim() : null,
      amount: amt,
      description: description.trim() || null,
      created_at
    })
    setBusy(false)
    if (error) return toast.error('Could not save expense')
    toast.success('Expense saved')
    setAmount(''); setDescription(''); setCustomCategory('')
    load()
  }

  const remove = async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    setToDelete(null)
    if (error) return toast.error('Could not delete')
    toast.success('Expense deleted')
    load()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading font-bold text-2xl text-ink">Expenses</h1>
        <p className="text-sm text-ink-300">Record spend and track it over time</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {loading ? <SkeletonCard /> : (
          <>
            <StatCard label="Today" value={formatINR(todayTotal)} accent="press" icon="−" />
            <StatCard label="This Month" value={formatINR(monthTotal)} accent="ink" icon="▲" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Form */}
        <form onSubmit={save} className="card space-y-4 lg:col-span-2 h-fit">
          <h3 className="font-heading font-bold text-ink">Add Expense</h3>
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {category === 'Other' && (
            <div>
              <label className="label">Custom Category *</label>
              <input className="input" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} />
            </div>
          )}
          <div>
            <label className="label">Amount (₹) *</label>
            <input type="number" className="input font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input min-h-[70px]" placeholder="Optional" value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} max={todayIST()} />
          </div>
          <button className="btn-accent w-full" disabled={busy}>{busy ? 'Saving…' : 'Save Expense'}</button>
        </form>

        {/* Recent list */}
        <div className="card lg:col-span-3">
          <h3 className="font-heading font-bold text-ink mb-4">Recent Expenses</h3>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : expenses.length === 0 ? (
            <EmptyState icon="🧾" title="No expenses yet" message="Add your first expense using the form." />
          ) : (
            <div className="divide-y divide-ink-50">
              {expenses.map((ex) => (
                <motion.div key={ex.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center justify-between py-3 group">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="pill bg-ink-50 text-ink-400">{ex.category === 'Other' ? ex.custom_category : ex.category}</span>
                      <span className="text-xs text-ink-300">{formatDateTime(ex.created_at)}</span>
                    </div>
                    {ex.description && <div className="text-sm text-charcoal/80 mt-1 truncate">{ex.description}</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono font-semibold text-press">{formatINR(ex.amount)}</span>
                    <button onClick={() => setToDelete(ex)}
                      className="text-ink-200 hover:text-press transition-colors text-lg leading-none opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Delete expense?"
        message={toDelete ? `Delete ${formatINR(toDelete.amount)} (${toDelete.category === 'Other' ? toDelete.custom_category : toDelete.category})? This cannot be undone.` : ''}
        confirmText="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={() => remove(toDelete.id)}
      />
    </div>
  )
}
