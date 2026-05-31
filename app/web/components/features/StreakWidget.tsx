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
    </div>
  )
}
