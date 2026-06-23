import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null) // 'owner' | 'design' | 'print'
  const [loading, setLoading] = useState(true)

  const loadRole = async (s) => {
    if (!s?.user) { setRole(null); return }
    const { data } = await supabase
      .from('profiles').select('role').eq('id', s.user.id).maybeSingle()
    // Default to 'owner' if no profile row yet — the database RLS still blocks
    // any sensitive data, so this is only about which UI to show.
    setRole(data?.role || 'owner')
  }

  useEffect(() => {
    // Safety: never leave the app stuck on the "Loading…" screen — if auth
    // resolution stalls for any reason, stop blocking after 6s.
    const failsafe = setTimeout(() => setLoading(false), 6000)
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session ?? null)
      await loadRole(data.session)
      setLoading(false)
      clearTimeout(failsafe)
    })
    // NOTE: do NOT await a Supabase query directly inside this callback —
    // supabase-js holds an internal auth lock here, and another Supabase call
    // (loadRole queries 'profiles') can deadlock it. On a cold PWA launch that
    // left the app stuck on the "Loading…" screen until a manual refresh.
    // Defer loadRole out of the callback so the lock is released first.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setTimeout(() => { loadRole(s) }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      role,
      isDesign: role === 'design',
      isPrint: role === 'print',
      loading,
      signIn,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
