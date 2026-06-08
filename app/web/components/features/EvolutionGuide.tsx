'use client'
import { useEffect, useRef } from 'react'
import { PLANT_LEVELS, getPlantLevel, getPlantLevelProgress } from '@/lib/streak-levels'

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

// ── Full variant — shows all 7 stages as a vertical list ─────────────────────
function FullGuide({ currentDays }: { currentDays: number }) {
  const activeLvl = getPlantLevel(currentDays)

  return (
    <div className="space-y-1.5">
      {/* Stage list */}
      {PLANT_LEVELS.map((lvl, i) => {
        const isPast    = currentDays > lvl.from && lvl.level < activeLvl.level
        const isCurrent = lvl.level === activeLvl.level
        const isFuture  = lvl.level > activeLvl.level
        const progress  = isCurrent ? getPlantLevelProgress(currentDays, activeLvl) : 0
        const daysToThis = isFuture ? lvl.from - currentDays : 0
        const nextLvl = PLANT_LEVELS[i + 1]

        return (
          <div key={lvl.level}>
            <div
              className={`relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-200 ${
                isCurrent
                  ? 'shadow-[0_2px_12px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]'
                  : ''
              }`}
              style={
                isCurrent
                  ? { background: lvl.bgColor, border: `1.5px solid ${lvl.borderColor}` }
                  : isFuture
                    ? { background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }
                    : { background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)' }
              }
            >
              {/* Status icon */}
              <div className="w-5 flex-shrink-0 flex items-center justify-center">
                {isPast && (
                  <svg className="w-4 h-4 text-brand-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="2 8 6 12 14 4" />
                  </svg>
                )}
                {isCurrent && (
                  <span className="w-2 h-2 rounded-full bg-brand-500 motion-safe:animate-breathe" aria-hidden />
                )}
                {isFuture && (
                  <svg className="w-3.5 h-3.5 text-gray-300" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="7" width="10" height="8" rx="1.5" />
                    <path d="M5 7V5a3 3 0 016 0v2" />
                  </svg>
                )}
              </div>

              {/* Emoji */}
              <span
                className={`text-xl leading-none flex-shrink-0 select-none ${
                  isFuture ? 'grayscale opacity-40' : ''
                } ${isCurrent ? 'motion-safe:animate-plant-sway' : ''}`}
                aria-hidden
              >
                {lvl.emoji}
              </span>

              {/* Name + days required */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`text-[12px] font-bold leading-tight ${
                      isCurrent ? 'text-gray-900' : isFuture ? 'text-gray-400' : 'text-gray-600'
                    }`}
                  >
                    {lvl.name}
                    {isCurrent && (
                      <span className="ml-1.5 text-[9px] font-bold tracking-wide uppercase text-brand-600 bg-brand-100 px-1.5 py-0.5 rounded-full">
                        You
                      </span>
                    )}
                  </p>
                  <span className={`text-[10px] font-semibold flex-shrink-0 ${isFuture ? 'text-gray-300' : 'text-gray-400'}`}>
                    {lvl.from === 0 ? 'Start' : `${lvl.from}d`}
                  </span>
                </div>

                {/* Progress bar — current stage only */}
                {isCurrent && lvl.nextAt !== Infinity && (
                  <div className="mt-1.5 space-y-0.5">
                    <ProgressBar progress={progress} color={lvl.color} />
                    <p className="text-[10px] leading-none" style={{ color: lvl.color }}>
                      {currentDays} / {lvl.nextAt} days
                      {nextLvl && ` → ${nextLvl.emoji} in ${lvl.nextAt - currentDays} day${lvl.nextAt - currentDays !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                )}

                {/* Days to unlock — future */}
                {isFuture && (
                  <p className="text-[10px] text-gray-300 mt-0.5 leading-none">
                    {daysToThis} more day{daysToThis !== 1 ? 's' : ''} away
                  </p>
                )}
              </div>
            </div>

            {/* Connector line between stages */}
            {i < PLANT_LEVELS.length - 1 && (
              <div className="flex justify-center">
                <div
                  className="w-0.5 h-2 rounded-full"
                  style={{
                    background: lvl.level < activeLvl.level
                      ? 'rgba(34,197,94,0.3)'
                      : 'rgba(0,0,0,0.06)',
                  }}
                  aria-hidden
                />
              </div>
            )}
          </div>
        )
      })}

      {/* Rules section */}
      <div
        className="rounded-2xl px-3 py-3 mt-1 space-y-1.5"
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

// ── Compact variant — horizontal emoji ladder for sidebar ─────────────────────
function CompactGuide({ currentDays }: { currentDays: number }) {
  const activeLvl = getPlantLevel(currentDays)
  const progress = getPlantLevelProgress(currentDays, activeLvl)
  const nextLvl = PLANT_LEVELS[activeLvl.level + 1]

  return (
    <div className="space-y-3">
      {/* Horizontal evolution dots */}
      <div className="flex items-center justify-between px-1">
        {PLANT_LEVELS.map((lvl) => {
          const isCurrent = lvl.level === activeLvl.level
          const isPast    = lvl.level < activeLvl.level
          return (
            <div key={lvl.level} className="flex flex-col items-center gap-0.5">
              <span
                className={`text-base leading-none select-none transition-all ${
                  isCurrent
                    ? 'text-[20px] motion-safe:animate-plant-sway drop-shadow-sm'
                    : isPast
                      ? 'text-[15px] opacity-60'
                      : 'text-[13px] grayscale opacity-30'
                }`}
                title={`${lvl.name} — ${lvl.from === 0 ? 'Start' : `${lvl.from} days`}`}
                aria-label={`${lvl.name}${isCurrent ? ' (current)' : ''}`}
              >
                {lvl.emoji}
              </span>
              {/* Active indicator dot */}
              {isCurrent && (
                <span className="w-1 h-1 rounded-full bg-brand-500" aria-hidden />
              )}
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
