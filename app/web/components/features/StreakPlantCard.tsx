'use client'
import { useEffect, useRef } from 'react'
import { PLANT_LEVELS, getPlantLevel, getPlantLevelProgress } from '@/lib/streak-levels'

interface StreakPlantCardProps {
  current: number
}

export function StreakPlantCard({ current }: StreakPlantCardProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const lvl = getPlantLevel(current)
  const progress = getPlantLevelProgress(current, lvl)
  const isLegendary = lvl.level === 6
  const daysToNext = isLegendary ? null : lvl.nextAt - current
  const nextLvl = PLANT_LEVELS[lvl.level + 1]

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
        background: `linear-gradient(135deg, ${lvl.bgColor} 0%, #dcfce7 100%)`,
        border: `1px solid ${lvl.borderColor}`,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="text-[2rem] leading-none select-none flex-shrink-0 motion-safe:animate-plant-sway"
          aria-label={`${lvl.name} — Level ${lvl.level}`}
        >
          {lvl.emoji}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[15px] font-bold text-gray-900 leading-tight tabular-nums">
              {current}-day streak
            </p>
            <span
              className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full leading-none mt-0.5"
              style={{ color: lvl.color, background: lvl.bgColor, border: `1px solid ${lvl.borderColor}` }}
            >
              {isLegendary ? '🌸 Legendary' : `Lv.${lvl.level} · ${lvl.name}`}
            </span>
          </div>

          {!isLegendary && nextLvl ? (
            <div className="space-y-1.5">
              <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
                <div
                  ref={barRef}
                  className="h-full rounded-full"
                  style={{ background: lvl.color, width: '0%' }}
                />
              </div>
              <p className="text-[11px] leading-none" style={{ color: lvl.color }}>
                {daysToNext === 1 ? '1 more day' : `${daysToNext} more days`} to evolve into {nextLvl.emoji} {nextLvl.shortName}
              </p>
            </div>
          ) : (
            <p className="text-xs font-semibold" style={{ color: lvl.color }}>
              🏆 Maximum evolution reached — {current} days strong
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
