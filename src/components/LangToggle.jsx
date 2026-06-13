import { useLang } from '../context/LanguageContext'

// EN | த toggle for switching the interface language.
export default function LangToggle({ dark = false }) {
  const { lang, setLang } = useLang()
  const base = 'px-2.5 py-1 text-xs font-bold rounded-lg transition-colors'
  const activeCls = dark ? 'bg-white text-ink' : 'bg-ink text-white'
  const idleCls = dark ? 'text-white/70 hover:text-white' : 'text-ink-300 hover:text-ink'

  return (
    <div className={`inline-flex items-center gap-0.5 rounded-xl p-0.5 ${dark ? 'bg-white/10' : 'bg-white shadow-card'}`}>
      <button onClick={() => setLang('en')} className={`${base} ${lang === 'en' ? activeCls : idleCls}`}>EN</button>
      <button onClick={() => setLang('ta')} className={`${base} ${lang === 'ta' ? activeCls : idleCls}`}>த</button>
    </div>
  )
}
