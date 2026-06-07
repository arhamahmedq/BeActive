'use client'
import Link from 'next/link'
import type { StreakData, DisplayTier } from '@/hooks/useStreak'

interface StreakWidgetProps {
  streak: StreakData | null
  isLoading: boolean
}

interface TierConfig {
  gradient: string
  border: string
  dotColor: string
  labelColor: string
  subColor: string
  label: string
  sub: string | null
}

const TIER_CONFIG: Record<DisplayTier, TierConfig> = {
  COMPLETED_TODAY: {
    gradient:   'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    border:     '#bbf7d0',
    dotColor:   '#22c55e',
    label:      'Locked in for today.',
    labelColor: '#059669',
    sub:        null,
    subColor:   '#059669',
  },
  PENDING_TODAY: {
    gradient:   'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
    border:     '#e5e7eb',
    dotColor:   '#9ca3af',
    label:      'Post today\'s workout to keep it going.',
    labelColor: '#6b7280',
    sub:        null,
    subColor:   '#6b7280',
  },
  AT_RISK: {
    gradient:   'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    border:     '#fde68a',
    dotColor:   '#f59e0b',
    label:      'Streak at risk — today\'s almost over.',
    labelColor: '#b45309',
    sub:        null,
    subColor:   '#b45309',
  },
  BROKEN: {
    gradient:   'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
    border:     '#fecaca',
    dotColor:   '#ef4444',
    label:      'Streak ended',
    labelColor: '#b91c1c',
    sub:        null,
    subColor:   '#b91c1c',
  },
  INACTIVE: {
    gradient:   'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
    border:     '#e5e7eb',
    dotColor:   '#d1d5db',
    label:      'Post your first workout today.',
    labelColor: '#6b7280',
    sub:        null,
    subColor:   '#6b7280',
  },
}

function headline(tier: DisplayTier, current: number): string {
  if (tier === 'INACTIVE') return 'Start your streak'
  if (tier === 'BROKEN') return 'Streak ended'
  return `${current}-day streak`
}

export function StreakWidget({ streak, isLoading }: StreakWidgetProps) {
  if (isLoading) {
    return <div className="rounded-2xl p-5 animate-pulse h-24 bg-gray-100" />
  }

  const tier: DisplayTier = streak?.displayTier ?? 'INACTIVE'
  const cfg = TIER_CONFIG[tier]
  const current = streak?.current ?? 0
  const best = streak?.best ?? 0

  const subText =
    tier === 'BROKEN'
      ? `You were on a ${best}-day streak. Start a new one today.`
      : cfg.label

  const showNumber = tier !== 'INACTIVE' && tier !== 'BROKEN'

  return (
    <div
      className="rounded-2xl p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.005] active:scale-[0.995] cursor-default select-none"
      style={{ background: cfg.gradient, border: `1px solid ${cfg.border}` }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: number + streak label */}
        <div className="flex-1 min-w-0">
          {showNumber ? (
            <div className="flex items-baseline gap-2 mb-1">
              <span
                className={`text-3xl font-bold tabular-nums leading-none ${tier === 'COMPLETED_TODAY' ? 'motion-safe:animate-streak-pulse' : ''}`}
                style={{ color: cfg.labelColor }}
              >
                {current}
              </span>
              <span className="text-sm font-medium" style={{ color: cfg.labelColor }}>
                day streak
              </span>
            </div>
          ) : (
            <div className="mb-1">
              <span className="text-base font-semibold" style={{ color: cfg.labelColor }}>
                {headline(tier, current)}
              </span>
            </div>
          )}

          {/* Status line */}
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: cfg.dotColor }}
              aria-hidden
            />
            <span className="text-xs" style={{ color: cfg.subColor }}>
              {subText}
            </span>
          </div>
        </div>

        {/* Right: best + CTA */}
        <div className="text-right flex-shrink-0">
          {best > 0 && tier !== 'BROKEN' && (
            <div>
              <p className="text-xl font-bold tabular-nums text-gray-900 leading-none">{best}</p>
              <p className="text-xs text-gray-400 mt-0.5">best</p>
            </div>
          )}
          {(tier === 'INACTIVE' || tier === 'AT_RISK' || tier === 'BROKEN') && (
            <Link
              href="/upload"
              className="inline-flex items-center gap-1 mt-2 bg-brand-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-brand-600 transition-colors whitespace-nowrap shadow-[0_2px_8px_rgba(34,197,94,0.25)]"
            >
              Log workout
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
