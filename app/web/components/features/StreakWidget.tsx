'use client'
import Link from 'next/link'
import type { StreakData, DisplayTier } from '@/hooks/useStreak'

// ── Pet emoji by streak count ────────────────────────────────────────────────
function getPetEmoji(current: number): string {
  if (current === 0)   return '🌱'
  if (current < 50)    return '🌿'
  if (current < 100)   return '🌲'
  if (current < 200)   return '🌳'
  if (current < 1000)  return '🎄'
  return '🌸'
}

// ── Milestone ladder for ring progress ──────────────────────────────────────
function getNextMilestone(n: number): number {
  if (n < 7)   return 7
  if (n < 30)  return 30
  if (n < 100) return 100
  if (n < 365) return 365
  return Math.ceil((n + 1) / 100) * 100
}

function getPrevMilestone(n: number): number {
  if (n < 7)   return 0
  if (n < 30)  return 7
  if (n < 100) return 30
  if (n < 365) return 100
  return Math.floor(n / 100) * 100
}

function getRingProgress(current: number, tier: DisplayTier): number {
  if (tier === 'INACTIVE' || tier === 'BROKEN' || current === 0) return 0
  const next = getNextMilestone(current)
  const prev = getPrevMilestone(current)
  return (current - prev) / (next - prev)
}

// ── Design tokens per tier ──────────────────────────────────────────────────
const RING_COLORS: Record<DisplayTier, string> = {
  COMPLETED_TODAY: '#22c55e',
  PENDING_TODAY:   '#d1d5db',
  AT_RISK:         '#f59e0b',
  BROKEN:          '#ef4444',
  INACTIVE:        '#e5e7eb',
}

const RING_TRACK: Record<DisplayTier, string> = {
  COMPLETED_TODAY: 'rgba(34,197,94,0.12)',
  PENDING_TODAY:   'rgba(0,0,0,0.05)',
  AT_RISK:         'rgba(245,158,11,0.12)',
  BROKEN:          'rgba(239,68,68,0.08)',
  INACTIVE:        'rgba(0,0,0,0.05)',
}

const TEXT_COLORS: Record<DisplayTier, string> = {
  COMPLETED_TODAY: '#059669',
  PENDING_TODAY:   '#6b7280',
  AT_RISK:         '#b45309',
  BROKEN:          '#b91c1c',
  INACTIVE:        '#6b7280',
}

const CARD_BG: Record<DisplayTier, string> = {
  COMPLETED_TODAY: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
  PENDING_TODAY:   'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
  AT_RISK:         'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
  BROKEN:          'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
  INACTIVE:        'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
}

const CARD_BORDER: Record<DisplayTier, string> = {
  COMPLETED_TODAY: '#bbf7d0',
  PENDING_TODAY:   '#e5e7eb',
  AT_RISK:         '#fde68a',
  BROKEN:          '#fecaca',
  INACTIVE:        '#e5e7eb',
}

// ── Circular progress ring ───────────────────────────────────────────────────
const RING_SIZE = 88
const CX = 44
const CY = 44
const R = 32
const STROKE = 5.5
const CIRC = 2 * Math.PI * R // ~201.06

interface RingProps {
  current: number
  tier: DisplayTier
}

function StreakRing({ current, tier }: RingProps) {
  const progress = getRingProgress(current, tier)
  const offset = CIRC * (1 - Math.max(0, Math.min(1, progress)))
  const showNumber = tier !== 'INACTIVE' && tier !== 'BROKEN'
  const isAtRisk = tier === 'AT_RISK'
  const isCompleted = tier === 'COMPLETED_TODAY'

  return (
    <div className="relative flex-shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        className={`-rotate-90 ${isAtRisk ? 'motion-safe:animate-streak-pulse' : ''}`}
        aria-hidden
      >
        {/* Track */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={RING_TRACK[tier]}
          strokeWidth={STROKE}
        />
        {/* Progress fill */}
        {progress > 0 && (
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={RING_COLORS[tier]}
            strokeWidth={STROKE}
            strokeDasharray={`${CIRC} ${CIRC}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className={`text-lg leading-none select-none ${
            isCompleted ? 'motion-safe:animate-pet-bounce' :
            isAtRisk    ? 'motion-safe:animate-breathe'    : ''
          }`}
          aria-hidden
        >
          {getPetEmoji(current)}
        </span>
        {showNumber ? (
          <>
            <span
              className="text-2xl font-bold tabular-nums leading-none mt-0.5"
              style={{ color: TEXT_COLORS[tier] }}
            >
              {current}
            </span>
            <span className="text-[9px] leading-none mt-0.5 text-gray-400">days</span>
          </>
        ) : (
          <span className="text-[9px] leading-none mt-1 text-gray-400">
            {tier === 'BROKEN' ? 'ended' : 'start!'}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Widget ───────────────────────────────────────────────────────────────────
interface StreakWidgetProps {
  streak: StreakData | null
  isLoading: boolean
}

export function StreakWidget({ streak, isLoading }: StreakWidgetProps) {
  if (isLoading) {
    return <div className="rounded-2xl p-5 animate-pulse h-24 bg-gray-100" />
  }

  const tier: DisplayTier = streak?.displayTier ?? 'INACTIVE'
  const current = streak?.current ?? 0
  const best = streak?.best ?? 0
  const localHour = streak?.localHour ?? new Date().getHours()
  const hoursLeft = 24 - localHour

  const headline =
    tier === 'INACTIVE' ? 'Start your streak' :
    tier === 'BROKEN'   ? 'Streak ended' :
    `${current}-day streak`

  const statusText =
    tier === 'COMPLETED_TODAY' ? 'Locked in for today 🎯' :
    tier === 'PENDING_TODAY'   ? "Post today's workout to keep going" :
    tier === 'AT_RISK'         ? (hoursLeft <= 1 ? 'Less than 1h left tonight — go!' : `${hoursLeft}h left tonight`) :
    tier === 'BROKEN'          ? `You had a ${best}-day streak. Start fresh today.` :
    'Post your first workout today'

  const isPersonalBest = tier === 'COMPLETED_TODAY' && current === best && current > 1
  const nextMilestone = current > 0 ? getNextMilestone(current) : null
  const showCTA = tier === 'INACTIVE' || tier === 'AT_RISK' || tier === 'BROKEN' || tier === 'PENDING_TODAY'
  const ctaLabel = tier === 'AT_RISK' ? '⚡ Post now' : '+ Log workout'

  return (
    <div
      className="rounded-2xl px-4 py-4 shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.995] select-none"
      style={{
        background: CARD_BG[tier],
        border: `1px solid ${CARD_BORDER[tier]}`,
      }}
    >
      <div className="flex items-center gap-4">
        {/* Circular progress ring */}
        <StreakRing current={current} tier={tier} />

        {/* Right: info */}
        <div className="flex-1 min-w-0">
          {/* Headline + personal best badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-base leading-tight">
              {headline}
            </span>
            {isPersonalBest && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                🏆 Best ever
              </span>
            )}
          </div>

          {/* Status line */}
          <p className="text-xs mt-0.5 leading-snug" style={{ color: TEXT_COLORS[tier] }}>
            {statusText}
          </p>

          {/* Best + next milestone */}
          {best > 0 && tier !== 'BROKEN' && tier !== 'INACTIVE' && (
            <p className="text-xs mt-1 text-gray-400">
              Best: <span className="font-medium text-gray-600">{best}</span>
              {nextMilestone && tier === 'PENDING_TODAY' && (
                <> · Next: <span className="font-medium text-gray-600">{nextMilestone}</span> days</>
              )}
            </p>
          )}

          {/* CTA */}
          {showCTA && (
            <Link
              href="/upload"
              className="inline-flex items-center gap-1 mt-2 bg-brand-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-brand-600 active:scale-95 transition-all shadow-[0_2px_8px_rgba(34,197,94,0.3)]"
            >
              {ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
