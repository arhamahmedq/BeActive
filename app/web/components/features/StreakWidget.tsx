'use client'
import type { StreakData, DisplayTier } from '@/hooks/useStreak'

interface StreakWidgetProps {
  streak: StreakData | null
  isLoading: boolean
}

interface TierConfig {
  border: string
  dot: string
  label: string
  labelColor: string
  sub: string | null
  subColor: string
}

const TIER_CONFIG: Record<DisplayTier, TierConfig> = {
  COMPLETED_TODAY: {
    border: 'border-brand-200',
    dot: 'bg-brand-400',
    label: 'Completed',
    labelColor: 'text-brand-700',
    sub: 'Locked in for today.',
    subColor: 'text-brand-600',
  },
  PENDING_TODAY: {
    border: 'border-white/40',
    dot: 'bg-gray-300',
    label: 'Pending',
    labelColor: 'text-gray-500',
    sub: 'Post today’s workout to keep it going.',
    subColor: 'text-gray-400',
  },
  AT_RISK: {
    border: 'border-amber-200',
    dot: 'bg-amber-400',
    label: 'At risk',
    labelColor: 'text-amber-700',
    sub: 'Streak at risk — today’s almost over.',
    subColor: 'text-amber-600',
  },
  BROKEN: {
    border: 'border-red-200',
    dot: 'bg-red-400',
    label: 'Streak ended',
    labelColor: 'text-red-700',
    sub: null,
    subColor: 'text-red-500',
  },
  INACTIVE: {
    border: 'border-white/40',
    dot: 'bg-gray-200',
    label: 'No streak',
    labelColor: 'text-gray-400',
    sub: 'Post your first workout today.',
    subColor: 'text-gray-400',
  },
}

function headline(tier: DisplayTier, current: number): string {
  if (tier === 'INACTIVE') return 'Start your streak'
  if (tier === 'BROKEN') return 'Streak ended'
  return `${current}-day streak`
}

export function StreakWidget({ streak, isLoading }: StreakWidgetProps) {
  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-4 animate-pulse h-20" />
    )
  }

  const tier: DisplayTier = streak?.displayTier ?? 'INACTIVE'
  const config = TIER_CONFIG[tier]
  const current = streak?.current ?? 0
  const best = streak?.best ?? 0

  const subText =
    tier === 'BROKEN'
      ? `You were on a ${best}-day streak. Start a new one today.`
      : config.sub

  return (
    <div className={`glass-card rounded-xl p-4 border ${config.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {tier !== 'INACTIVE' && tier !== 'BROKEN' && (
            <div className="text-center">
              <p className="text-3xl font-bold tabular-nums leading-none">{current}</p>
              <p className="text-xs text-gray-500 mt-0.5">day streak</p>
            </div>
          )}
          <div className={`flex items-center gap-1.5 text-xs font-medium ${config.labelColor}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} aria-hidden />
            {headline(tier, current)}
          </div>
        </div>
        {best > 0 && tier !== 'BROKEN' && (
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">{best}</p>
            <p className="text-xs text-gray-400">best</p>
          </div>
        )}
      </div>
      {subText && (
        <p className={`text-xs mt-2 ${config.subColor}`}>{subText}</p>
      )}
    </div>
  )
}
