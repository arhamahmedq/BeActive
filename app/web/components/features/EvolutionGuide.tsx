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
function ProgressBar({ progress, color, size = 'sm' }: { progress: number; color: string; size?: 'sm' | 'md' }) {
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
    <div className={`${size === 'md' ? 'h-2' : 'h-1.5'} rounded-full overflow-hidden`} style={{ background: 'rgba(0,0,0,0.06)' }}>
      <div ref={barRef} className="h-full rounded-full" style={{ background: color, width: '0%' }} />
    </div>
  )
}

// ── Tile — illustration + uppercase label + past checkmark ──────────────────
type CardState = 'past' | 'current' | 'future'

function EvolutionCard({
  lvl,
  state,
  compact = false,
}: {
  lvl: PlantLevel
  state: CardState
  compact?: boolean
}) {
  const isCurrent = state === 'current'
  const isFuture = state === 'future'
  const isPast = state === 'past'

  const labelColor = isCurrent ? lvl.color : isFuture ? '#9ca3af' : '#374151'

  const containerStyle = isCurrent
    ? {
        background: lvl.bgColor,
        border: `2px solid ${lvl.color}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.8)',
      }
    : isFuture
      ? { background: '#f9fafb', border: '1px solid #e5e7eb' }
      : { background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)' }

  return (
    <div
      className={`flex flex-col items-center justify-start gap-2 rounded-2xl text-center transition-all duration-200 ${
        compact ? 'w-16 flex-shrink-0 px-2 py-3 gap-1.5' : 'px-2 py-4'
      } ${compact && isCurrent ? 'ring-2 ring-brand-500 scale-105' : ''}`}
      style={containerStyle}
    >
      <PlantIllustration level={lvl} locked={isFuture} size={compact ? 40 : 64} />
      {/* Reserve a fixed two-line height so single- and two-line labels (and the
          past-state checkmark below) line up across the row, regardless of tier. */}
      <span
        className={`text-eyebrow leading-tight flex items-center justify-center ${compact ? '!text-[9px] min-h-[1.8em]' : 'min-h-[2.4em]'}`}
        style={{ color: labelColor }}
      >
        {lvl.shortName}
      </span>
      {isPast && (
        <svg className="w-4 h-4 text-brand-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="2 8 6 12 14 4" />
        </svg>
      )}
    </div>
  )
}

// ── Full variant — 3-tile evolution window + journey/tier progress ──────────
function FullGuide({ currentDays }: { currentDays: number }) {
  const activeLvl = getPlantLevel(currentDays)
  const maxLevel = PLANT_LEVELS.length - 1

  // 3-tile window centered on the active tier, clamped to stay in bounds
  const windowStart = Math.max(0, Math.min(activeLvl.level - 1, maxLevel - 2))
  const windowLevels = PLANT_LEVELS.slice(windowStart, windowStart + 3)

  const levelProgress = getPlantLevelProgress(currentDays, activeLvl)
  const overallProgress = (activeLvl.level + levelProgress) / maxLevel
  const nextLvl = PLANT_LEVELS[activeLvl.level + 1]
  const remaining = activeLvl.nextAt - currentDays

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {windowLevels.map((lvl) => {
          const state: CardState =
            lvl.level === activeLvl.level ? 'current' : lvl.level < activeLvl.level ? 'past' : 'future'
          return <EvolutionCard key={lvl.level} lvl={lvl} state={state} />
        })}
      </div>

      {/* Overall journey progress */}
      <ProgressBar progress={overallProgress} color="#9ca3af" size="md" />

      {/* Current tier progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-gray-900">
            <span aria-hidden>{activeLvl.emoji}</span> {activeLvl.shortName}
          </span>
          {activeLvl.nextAt !== Infinity && (
            <span className="text-[12px] text-gray-400 tabular-nums">
              {currentDays}/{activeLvl.nextAt}d
            </span>
          )}
        </div>
        <ProgressBar progress={levelProgress} color={activeLvl.color} />
        {nextLvl ? (
          <p className="text-[11px] text-gray-400">
            {remaining} day{remaining !== 1 ? 's' : ''} to {nextLvl.emoji} {nextLvl.shortName}
          </p>
        ) : (
          <p className="text-[11px] font-bold" style={{ color: activeLvl.color }}>
            🌸 Maximum level reached!
          </p>
        )}
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

// ── Compact variant — horizontal scroll-snap row of small cards ─────────────
function CompactGuide({ currentDays }: { currentDays: number }) {
  const activeLvl = getPlantLevel(currentDays)
  const progress = getPlantLevelProgress(currentDays, activeLvl)
  const nextLvl = PLANT_LEVELS[activeLvl.level + 1]

  return (
    <div className="space-y-3">
      {/* Horizontal collectible card row */}
      <div className="flex items-start gap-2 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1">
        {PLANT_LEVELS.map((lvl) => {
          const isPast = lvl.level < activeLvl.level
          const isCurrent = lvl.level === activeLvl.level
          const state: CardState = isCurrent ? 'current' : isPast ? 'past' : 'future'

          return (
            <div key={lvl.level} className="snap-start">
              <EvolutionCard lvl={lvl} state={state} compact />
            </div>
          )
        })}
      </div>

      {/* Progress to next */}
      {activeLvl.nextAt !== Infinity && nextLvl && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-600">
              {activeLvl.emoji} {activeLvl.shortName}
            </span>
            <span className="text-[11px] text-gray-400 tabular-nums">
              {currentDays}/{activeLvl.nextAt}d
            </span>
          </div>
          <ProgressBar progress={progress} color={activeLvl.color} />
          <p className="text-[10px] text-gray-400">
            {activeLvl.nextAt - currentDays} day{activeLvl.nextAt - currentDays !== 1 ? 's' : ''} to {nextLvl.emoji} {nextLvl.shortName}
          </p>
        </div>
      )}

      {activeLvl.level === 6 && (
        <p className="text-[11px] font-bold text-pink-600 text-center">
          🌸 Legendary — Maximum level reached!
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
