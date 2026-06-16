'use client'
import { useEffect, useRef } from 'react'
import { PLANT_LEVELS, getPlantLevel, getPlantLevelProgress, type PlantLevel } from '@/lib/streak-levels'
import { PlantIllustration } from './PlantIllustrations'

interface EvolutionGuideProps {
  currentDays: number
  /** compact = sidebar strip; full = modal/expanded widget */
  variant?: 'full' | 'compact'
}

// ── Progress bar with animated fill ─────────────────────────────────────────
function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    bar.style.width = '0%'
    const raf = requestAnimationFrame(() => {
      bar.style.transition = 'width 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      bar.style.width = `${Math.min(100, Math.round(progress * 100))}%`
    })
    return () => cancelAnimationFrame(raf)
  }, [progress])

  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
      <div ref={barRef} className="h-full rounded-full" style={{ background: color, width: '0%' }} />
    </div>
  )
}

type CardState = 'past' | 'current' | 'future'

// ── Collectible card — illustration + boarding-pass stat/label ──────────────
// FULL variant only. Restored to the original pre-redesign dropdown design.
function EvolutionCard({
  lvl,
  nextLvl,
  state,
  currentDays,
}: {
  lvl: PlantLevel
  nextLvl?: PlantLevel
  state: CardState
  currentDays: number
}) {
  const isCurrent = state === 'current'
  const isFuture = state === 'future'
  const progress = isCurrent ? getPlantLevelProgress(currentDays, lvl) : 0
  const daysToThis = isFuture ? lvl.from - currentDays : 0
  const remaining = lvl.nextAt - currentDays

  const statColor = isCurrent ? lvl.color : isFuture ? '#d1d5db' : '#374151'
  const labelColor = isCurrent ? lvl.color : isFuture ? '#d1d5db' : '#9ca3af'

  const containerStyle = isCurrent
    ? { background: lvl.bgColor, border: `1.5px solid ${lvl.borderColor}` }
    : isFuture
      ? { background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }
      : { background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)' }

  return (
    <div
      className={`relative flex flex-col items-center gap-1.5 rounded-2xl px-3 py-3 text-center transition-all duration-200 ${
        isCurrent ? 'shadow-[0_2px_12px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]' : ''
      }`}
      style={containerStyle}
    >
      <PlantIllustration level={lvl} locked={isFuture} size={56} />

      <div>
        <p className="text-xl font-extrabold leading-none tabular-nums" style={{ color: statColor }}>
          {isCurrent
            ? lvl.nextAt === Infinity ? currentDays : `${currentDays}/${lvl.nextAt}`
            : lvl.from === 0 ? 'START' : lvl.from}
        </p>
        <p className="text-eyebrow mt-0.5" style={{ color: labelColor }}>
          {lvl.shortName}
        </p>
      </div>

      {isCurrent && (
        lvl.nextAt !== Infinity ? (
          <div className="w-full space-y-1">
            <ProgressBar progress={progress} color={lvl.color} />
            {nextLvl && (
              <p className="text-[10px] leading-none" style={{ color: lvl.color }}>
                {remaining} day{remaining !== 1 ? 's' : ''} to {nextLvl.shortName}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[10px] font-bold" style={{ color: lvl.color }}>Max level</p>
        )
      )}

      {state === 'past' && (
        <svg className="w-4 h-4 text-brand-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="2 8 6 12 14 4" />
        </svg>
      )}

      {isFuture && (
        <p className="text-[10px] text-gray-300 leading-none">
          {daysToThis} day{daysToThis !== 1 ? 's' : ''} away
        </p>
      )}
    </div>
  )
}

// ── Full variant — collectible card grid for all 7 stages (original design) ──
function FullGuide({ currentDays }: { currentDays: number }) {
  const activeLvl = getPlantLevel(currentDays)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {PLANT_LEVELS.map((lvl, i) => {
          const isPast = currentDays > lvl.from && lvl.level < activeLvl.level
          const isCurrent = lvl.level === activeLvl.level
          const state: CardState = isCurrent ? 'current' : isPast ? 'past' : 'future'

          return (
            <EvolutionCard
              key={lvl.level}
              lvl={lvl}
              nextLvl={PLANT_LEVELS[i + 1]}
              state={state}
              currentDays={currentDays}
            />
          )
        })}
      </div>

      {/* Rules section */}
      <div
        className="rounded-2xl px-3 py-3 space-y-1.5"
        style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">How it works</p>
        <RuleRow icon="🌱" text="Post one verified workout per day to grow" />
        <RuleRow icon="⚠️" text="Missing a day breaks your streak and resets your plant to Seed" />
        <RuleRow icon="🏆" text="Your best-ever streak is saved forever, even if you reset" />
        <RuleRow icon="✅" text="AI verifies your photo before the day counts" />
      </div>
    </div>
  )
}

function RuleRow({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[13px] leading-none flex-shrink-0 mt-0.5" aria-hidden>{icon}</span>
      <p className="text-[11px] text-gray-500 leading-snug">{text}</p>
    </div>
  )
}

// ── Compact tier card — restyled sidebar pill (branded, current-emphasised) ──
function CompactTierCard({ lvl, state }: { lvl: PlantLevel; state: CardState }) {
  const isCurrent = state === 'current'
  const isPast = state === 'past'
  const isFuture = state === 'future'

  return (
    <div className="snap-start flex flex-col items-center gap-1.5 flex-shrink-0 w-[54px]">
      <div
        className={`relative flex items-center justify-center rounded-2xl transition-all duration-200 ${isCurrent ? 'scale-110' : ''}`}
        style={{
          width: 50,
          height: 50,
          background: isCurrent ? lvl.bgColor : isFuture ? 'rgba(0,0,0,0.02)' : 'rgba(34,197,94,0.05)',
          border: isCurrent ? `1.5px solid ${lvl.borderColor}` : '1px solid rgba(0,0,0,0.06)',
          boxShadow: isCurrent ? `0 3px 12px ${lvl.color}26, inset 0 1px 0 rgba(255,255,255,0.7)` : 'none',
        }}
      >
        <PlantIllustration level={lvl} locked={isFuture} size={34} />
        {isPast && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center shadow-sm">
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="2 8 6 12 14 4" />
            </svg>
          </span>
        )}
      </div>
      <span
        className="text-[8.5px] font-bold uppercase tracking-wide leading-tight text-center"
        style={{ color: isCurrent ? lvl.color : isFuture ? '#9ca3af' : '#6b7280' }}
      >
        {lvl.shortName}
      </span>
    </div>
  )
}

// ── Compact variant — restyled horizontal tier row + branded progress panel ──
function CompactGuide({ currentDays }: { currentDays: number }) {
  const activeLvl = getPlantLevel(currentDays)
  const progress = getPlantLevelProgress(currentDays, activeLvl)
  const nextLvl = PLANT_LEVELS[activeLvl.level + 1]
  const remaining = activeLvl.nextAt - currentDays

  return (
    <div className="space-y-3">
      {/* Horizontal collectible tier row */}
      <div className="flex items-start gap-1.5 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1">
        {PLANT_LEVELS.map((lvl) => {
          const state: CardState =
            lvl.level === activeLvl.level ? 'current' : lvl.level < activeLvl.level ? 'past' : 'future'
          return <CompactTierCard key={lvl.level} lvl={lvl} state={state} />
        })}
      </div>

      {/* Branded progress panel for the current tier */}
      {activeLvl.nextAt !== Infinity && nextLvl ? (
        <div
          className="space-y-1.5 rounded-2xl px-3 py-2.5"
          style={{ background: activeLvl.bgColor, border: `1px solid ${activeLvl.borderColor}` }}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[12px] font-bold" style={{ color: activeLvl.color }}>
              <span aria-hidden>{activeLvl.emoji}</span> {activeLvl.shortName}
            </span>
            <span className="text-[11px] font-semibold text-gray-500 tabular-nums">
              {currentDays}/{activeLvl.nextAt}d
            </span>
          </div>
          <ProgressBar progress={progress} color={activeLvl.color} />
          <p className="text-[10px] text-gray-500">
            <span className="font-semibold" style={{ color: activeLvl.color }}>
              {remaining} day{remaining !== 1 ? 's' : ''}
            </span>{' '}
            to {nextLvl.emoji} {nextLvl.shortName}
          </p>
        </div>
      ) : (
        <p className="text-[11px] font-bold text-center" style={{ color: activeLvl.color }}>
          🌸 Legendary — maximum level reached!
        </p>
      )}
    </div>
  )
}

// ── Public export ─────────────────────────────────────────────────────────────
export function EvolutionGuide({ currentDays, variant = 'full' }: EvolutionGuideProps) {
  return variant === 'compact'
    ? <CompactGuide currentDays={currentDays} />
    : <FullGuide currentDays={currentDays} />
}
