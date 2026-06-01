'use client'
import { useStreakTimer } from '@/hooks/useStreakTimer'
import type { StreakData } from '@/hooks/useStreak'

interface StreakDebugPanelProps {
  streak: StreakData | null
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toUTCString().slice(0, 25)} UTC`
}

function DebugCard({ label, value, color = 'text-slate-300' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-800 rounded-lg p-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xs font-mono font-semibold ${color} break-all`}>{value}</p>
    </div>
  )
}

export function StreakDebugPanel({ streak }: StreakDebugPanelProps) {
  const { computedStatus } = useStreakTimer(
    streak?.nextDeadline ?? null,
    streak?.atRiskAt ?? null
  )

  const lastVerifiedAt = streak?.lastVerifiedAt ?? null
  const nextDeadline = streak?.nextDeadline ?? null
  const atRiskAt = streak?.atRiskAt ?? null

  const progressPct = (() => {
    if (!lastVerifiedAt || !nextDeadline) return 0
    const start = new Date(lastVerifiedAt).getTime()
    const end = new Date(nextDeadline).getTime()
    const now = Date.now()
    return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
  })()

  const statusColor: Record<string, string> = {
    ACTIVE: 'text-green-400',
    AT_RISK: 'text-amber-400',
    BROKEN: 'text-red-400',
    INACTIVE: 'text-slate-400',
  }

  return (
    <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-3">
        streak debug
      </p>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <DebugCard label="lastVerifiedAt" value={fmt(lastVerifiedAt)} color="text-green-400" />
        <DebugCard label="nextDeadline" value={fmt(nextDeadline)} color="text-sky-400" />
        <DebugCard
          label="computedStatus"
          value={computedStatus}
          color={statusColor[computedStatus] ?? 'text-slate-300'}
        />
        <DebugCard label="atRiskAt" value={fmt(atRiskAt)} color="text-amber-400" />
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-2">24h window</p>
        <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
          {/* Green segment: 0 → min(progress, 83%) */}
          <div
            className="absolute left-0 top-0 h-full bg-green-400 rounded-full"
            style={{ width: `${Math.min(progressPct, 83)}%` }}
          />
          {/* Amber segment: 83% → progress (only visible past AT_RISK threshold) */}
          <div
            className="absolute top-0 h-full bg-amber-400"
            style={{
              left: '83%',
              width: `${Math.max(0, progressPct - 83)}%`,
            }}
          />
        </div>
        <div className="relative h-4">
          <div className="absolute top-0 h-full flex flex-col items-center" style={{ left: '83%' }}>
            <div className="w-px h-2 bg-amber-400" />
          </div>
          <div className="absolute top-0 h-full flex flex-col items-center" style={{ left: '100%', transform: 'translateX(-100%)' }}>
            <div className="w-px h-2 bg-red-400" />
          </div>
        </div>
        <div className="flex justify-between text-xs font-mono text-slate-600 mt-0.5">
          <span>T+0</span>
          <span className="text-amber-500" style={{ marginLeft: '72%' }}>AT_RISK</span>
          <span className="text-red-500">BREAK</span>
        </div>
      </div>
    </div>
  )
}
