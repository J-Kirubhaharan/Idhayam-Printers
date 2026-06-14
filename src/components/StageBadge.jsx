import { useLang } from '../context/LanguageContext'

// colour per production stage so the owner can see at a glance where a job is
const STYLE = {
  'Design Queue': 'bg-violet-100 text-violet-700',
  'Designing': 'bg-violet-600 text-white',
  'Design finished': 'bg-violet-100 text-violet-700',
  'Print Queue': 'bg-sky-100 text-sky-700',
  'Printing': 'bg-sky-600 text-white',
  'Print finished': 'bg-sky-100 text-sky-700',
  'Done': 'bg-leaf text-white'
}

// shows the live production stage (Design Queue → Designing → Print Queue → Printing → Done).
// Renders nothing for jobs that aren't in the pipeline ('None' / null).
export default function StageBadge({ stage, className = '' }) {
  const { t } = useLang()
  if (!stage || stage === 'None') return null
  const live = stage === 'Designing' || stage === 'Printing'
  return (
    <span className={`pill ${STYLE[stage] || 'bg-ink-50 text-ink-400'} ${live ? 'animate-pulse' : ''} ${className}`}>
      {t(`pstage.${stage}`)}
    </span>
  )
}
