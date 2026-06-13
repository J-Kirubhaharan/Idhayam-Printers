import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.warn(
    '[Idhayam] Supabase env vars missing. Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(url || 'http://placeholder.local', anon || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage
  }
})
