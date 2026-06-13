import { createContext, useContext, useState } from 'react'
import { strings } from '../lib/i18n'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('idhayam_lang') || 'en')

  const setLang = (l) => {
    setLangState(l)
    localStorage.setItem('idhayam_lang', l)
  }

  // t('key') → translated string; falls back to English, then to a readable
  // version of the key so nothing ever renders blank.
  const t = (key) => {
    const entry = strings[key]
    if (!entry) return key.includes('.') ? key.split('.').pop() : key
    return entry[lang] || entry.en || key
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLang = () => useContext(LanguageContext)
