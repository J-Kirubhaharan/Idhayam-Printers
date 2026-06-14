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
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session ?? null)
      await loadRole(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      await loadRole(s)
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
