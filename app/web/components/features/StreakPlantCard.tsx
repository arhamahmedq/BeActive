'use client'
import { useEffect, useRef } from 'react'

// ── Plant level ladder ────────────────────────────────────────────────────────
// Each level maps a day threshold → emoji, name, and the next evolution target.
const LEVELS = [
  { emoji: '🌱', name: 'Dormant Seed',    level: 0, from: 0,   nextAt: 1   },
  { emoji: '🌿', name: 'Sprout',           level: 1, from: 1,   nextAt: 7   },
  { emoji: '🪴', name: 'Growing Plant',    level: 2, from: 7,   nextAt: 30  },
  { emoji: '🌲', name: 'Strong Tree',      level: 3, from: 30,  nextAt: 100 },
  { emoji: '🌳', name: 'Ancient Tree',     level: 4, from: 100, nextAt: 200 },
  { emoji: '🎄', name: 'Elder Tree',       level: 5, from: 200, nextAt: 365 },
  { emoji: '🌸', name: 'Legendary Bloom',  level: 6, from: 365, nextAt: Infinity },
] as const

type Level = typeof LEVELS[number]

function getLevel(days: number): Level {
  let current: Level = LEVELS[0]
  for (const lvl of LEVELS) {
    if (days >= lvl.from) current = lvl
    else break
  }
  return current
}

function getLevelProgress(days: number, lvl: Level): number {
  if (lvl.nextAt === Infinity) return 1
  return (days - lvl.from) / (lvl.nextAt - lvl.from)
}

interface StreakPlantCardProps {
  current: number
}

export function StreakPlantCard({ current }: StreakPlantCardProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const lvl = getLevel(current)
  const progress = getLevelProgress(current, lvl)
  const isLegendary = lvl.level === 6
  const daysToNext = isLegendary ? null : lvl.nextAt - current

  // Animate progress bar from 0 → actual width on mount
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

  if (current === 0) {
    return (
      <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
        <span className="text-2xl leading-none select-none flex-shrink-0 motion-safe:animate-breathe" aria-hidden>
          🌱
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-600 leading-snug">No streak yet</p>
          <p className="text-xs text-gray-400 mt-0.5">Post a workout to start growing your plant</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl px-4 py-3.5"
      style={{
        background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
        border: '1px solid #bbf7d0',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Plant emoji — sways gently to signal life */}
        <span
          className="text-[2rem] leading-none select-none flex-shrink-0 motion-safe:animate-plant-sway"
          aria-label={`${lvl.name} plant`}
        >
          {lvl.emoji}
        </span>

        <div className="flex-1 min-w-0">
          {/* Headline + level badge */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[15px] font-bold text-gray-900 leading-tight tabular-nums">
              {current}-day streak
            </p>
            <span className="flex-shrink-0 text-[10px] font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full leading-none mt-0.5">
              {isLegendary ? '🌸 Legendary' : `Lv.${lvl.level} · ${lvl.name}`}
            </span>
          </div>

          {/* Progress bar */}
          {!isLegendary ? (
            <div className="space-y-1.5">
              <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
                <div
                  ref={barRef}
                  className="h-full bg-brand-500 rounded-full"
                  style={{ width: '0%' }}
                />
              </div>
              <p className="text-[11px] text-brand-700 leading-none">
                {daysToNext === 1 ? '1 more day' : `${daysToNext} more days`} to evolve into {LEVELS[lvl.level + 1]?.emoji ?? '🌸'}
              </p>
            </div>
          ) : (
            <p className="text-xs text-brand-700 font-semibold">
              🏆 Maximum evolution reached — {current} days strong
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
