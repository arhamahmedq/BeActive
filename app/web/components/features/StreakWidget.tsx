'use client'
import { useStreakTimer } from '@/hooks/useStreakTimer'
import type { StreakData } from '@/hooks/useStreak'

interface StreakWidgetProps {
  streak: StreakData | null
  isLoading: boolean
}

const STATUS_CONFIG = {
  ACTIVE: {
    dot: 'bg-green-400',
    label: 'Active',
    text: 'text-green-700',
    bg: 'bg-green-50 border-green-100',
  },
  AT_RISK: {
    dot: 'bg-amber-400',
    label: 'At risk',
    text: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-100',
  },
  BROKEN: {
    dot: 'bg-red-400',
    label: 'Broken',
    text: 'text-red-700',
    bg: 'bg-red-50 border-red-100',
  },
  INACTIVE: {
    dot: 'bg-gray-300',
    label: 'No streak',
    text: 'text-gray-500',
    bg: 'bg-white border-gray-100',
  },
}

const TIMER_ROW_CONFIG = {
  ACTIVE: {
    bg: 'bg-green-50',
    label: "You're safe",
    labelColor: 'text-green-700',
    valueColor: 'text-green-700',
  },
  AT_RISK: {
    bg: 'bg-amber-50',
    label: 'Post now to save it',
    labelColor: 'text-amber-700',
    valueColor: 'text-amber-700',
  },
  BROKEN: {
    bg: 'bg-red-50',
    label: 'Start a new streak',
    labelColor: 'text-red-700',
    valueColor: 'text-red-700',
  },
  INACTIVE: null,
}

function TimerRow({ nextDeadline, atRiskAt }: { nextDeadline: string | null; atRiskAt: string | null }) {
  const { hh, mm, ss, computedStatus } = useStreakTimer(nextDeadline, atRiskAt)
  const rowConfig = TIMER_ROW_CONFIG[computedStatus]
  if (!rowConfig) return null

  return (
    <div className={`rounded-lg px-3 py-2 flex items-center justify-between mt-3 ${rowConfig.bg}`}>
      <span className={`text-xs font-medium ${rowConfig.labelColor}`}>{rowConfig.label}</span>
      {computedStatus === 'BROKEN' ? (
        <span className={`text-xs font-semibold ${rowConfig.valueColor}`}>Reset required</span>
      ) : (
        <span className={`text-sm font-bold tabular-nums ${rowConfig.valueColor}`}>
          {hh}:{mm}:{ss}
        </span>
      )}
    </div>
  )
}

export function StreakWidget({ streak, isLoading }: StreakWidgetProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-20" />
    )
  }

  const status = streak?.status ?? 'INACTIVE'
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
  const current = streak?.current ?? 0
  const best = streak?.best ?? 0

  return (
    <div className={`rounded-xl border p-4 ${config.bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-3xl font-bold tabular-nums leading-none">{current}</p>
            <p className="text-xs text-gray-500 mt-0.5">day streak</p>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${config.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} aria-hidden />
            {config.label}
          </div>
        </div>
        {best > 0 && (
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">{best}</p>
            <p className="text-xs text-gray-400">best</p>
          </div>
        )}
      </div>
      <TimerRow
        nextDeadline={streak?.nextDeadline ?? null}
        atRiskAt={streak?.atRiskAt ?? null}
      />
    </div>
  )
}
