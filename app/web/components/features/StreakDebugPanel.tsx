'use client'
import type { StreakData } from '@/hooks/useStreak'

interface StreakDebugPanelProps {
  streak: StreakData | null
}

function DebugCard({ label, value, color = 'text-slate-300' }: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="bg-slate-800 rounded-lg p-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xs font-mono font-semibold ${color} break-all`}>{value}</p>
    </div>
  )
}

const TIER_COLOR: Record<string, string> = {
  COMPLETED_TODAY: 'text-green-400',
  PENDING_TODAY: 'text-slate-300',
  AT_RISK: 'text-amber-400',
  BROKEN: 'text-red-400',
  INACTIVE: 'text-slate-400',
}

export function StreakDebugPanel({ streak }: StreakDebugPanelProps) {
  const tier = streak?.displayTier ?? 'INACTIVE'

  return (
    <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-3">
        streak debug (v2)
      </p>

      <div className="grid grid-cols-2 gap-2">
        <DebugCard
          label="current"
          value={String(streak?.current ?? 0)}
          color="text-slate-200"
        />
        <DebugCard
          label="best"
          value={String(streak?.best ?? 0)}
          color="text-slate-200"
        />
        <DebugCard
          label="status (durable)"
          value={streak?.status ?? '—'}
          color={streak?.status === 'ACTIVE' ? 'text-green-400' : streak?.status === 'BROKEN' ? 'text-red-400' : 'text-slate-400'}
        />
        <DebugCard
          label="displayTier (derived)"
          value={tier}
          color={TIER_COLOR[tier] ?? 'text-slate-300'}
        />
        <DebugCard
          label="lastVerifiedDate"
          value={streak?.lastVerifiedDate ?? '—'}
          color="text-sky-400"
        />
        <DebugCard
          label="completedToday"
          value={streak?.completedToday ? 'true' : 'false'}
          color={streak?.completedToday ? 'text-green-400' : 'text-slate-400'}
        />
      </div>
    </div>
  )
}
