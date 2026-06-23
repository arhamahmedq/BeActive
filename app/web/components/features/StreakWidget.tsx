'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { StreakData, DisplayTier } from '@/hooks/useStreak'
import { getPlantLevel, PLANT_LEVELS } from '@/lib/streak-levels'
import { EvolutionGuide } from './EvolutionGuide'

// ── Milestone ring progress ──────────────────────────────────────────────────
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

// ── Design tokens ────────────────────────────────────────────────────────────
const RING_COLORS: Record<DisplayTier, string> = {
  COMPLETED_TODAY: '#4f7a3c',
  PENDING_TODAY:   '#d1d5db',
  AT_RISK:         '#f59e0b',
  BROKEN:          '#ef4444',
  INACTIVE:        '#e5e7eb',
}

const RING_TRACK: Record<DisplayTier, string> = {
  COMPLETED_TODAY: 'rgba(34,197,94,0.10)',
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

// Card backgrounds — premium glass-adjacent finish
const CARD_STYLE: Record<DisplayTier, React.CSSProperties> = {
  COMPLETED_TODAY: {
    background: 'linear-gradient(160deg, #f0fdf4 0%, #dcfce7 100%)',
    border: '1px solid #bbf7d0',
    boxShadow: '0 4px 24px rgba(34,197,94,0.12), 0 1px 4px rgba(34,197,94,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
  },
  PENDING_TODAY: {
    background: 'linear-gradient(160deg, #ffffff 0%, #f9fafb 100%)',
    border: '1px solid #e5e7eb',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1)',
  },
  AT_RISK: {
    background: 'linear-gradient(160deg, #fffbeb 0%, #fef3c7 100%)',
    border: '1px solid #fde68a',
    boxShadow: '0 4px 20px rgba(245,158,11,0.12), 0 1px 4px rgba(245,158,11,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
  },
  BROKEN: {
    background: 'linear-gradient(160deg, #fef2f2 0%, #fee2e2 100%)',
    border: '1px solid #fecaca',
    boxShadow: '0 2px 12px rgba(239,68,68,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
  },
  INACTIVE: {
    background: 'linear-gradient(160deg, #ffffff 0%, #f9fafb 100%)',
    border: '1px solid #e5e7eb',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1)',
  },
}

// ── Ring geometry ─────────────────────────────────────────────────────────────
// Old: 88px / R=32 / stroke=5.5 → inner clear diameter = 58.5px (content overflowed by ~4px)
// New: 116px / R=44 / stroke=8  → inner clear diameter = 80px (content fits with 10px breathing room)
const RING_SIZE = 116
const CX = 58; const CY = 58; const R = 44; const STROKE = 8
const CIRC = 2 * Math.PI * R // ≈ 276.5

// ── Ring component ────────────────────────────────────────────────────────────
// Only emoji + number inside the ring. "days" label lives BELOW the ring.
// This is the key proportion change: 2 elements in the ring instead of 3.
function StreakRing({ current, tier }: { current: number; tier: DisplayTier }) {
  const progress  = getRingProgress(current, tier)
  const offset    = CIRC * (1 - Math.max(0, Math.min(1, progress)))
  const plantLvl  = getPlantLevel(current)
  const showCount = tier !== 'INACTIVE' && tier !== 'BROKEN'

  return (
    <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
      {/* Ambient glow — state-aware, sits behind the ring */}
      {tier === 'COMPLETED_TODAY' && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(34,197,94,0.14) 40%, transparent 72%)',
            transform: 'scale(1.1)',
          }}
          aria-hidden
        />
      )}
      {tier === 'AT_RISK' && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none motion-safe:animate-streak-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(245,158,11,0.12) 40%, transparent 72%)',
            transform: 'scale(1.1)',
          }}
          aria-hidden
        />
      )}

      {/* Progress arc */}
      <svg
        width={RING_SIZE} height={RING_SIZE}
        className="-rotate-90"
        aria-hidden
      >
        {/* Track */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={RING_TRACK[tier]} strokeWidth={STROKE} />
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

      {/* Center — emoji + number ONLY. 2 elements, room to breathe. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-1">
        {showCount ? (
          <>
            <span
              className={`text-[28px] leading-none select-none ${
                tier === 'COMPLETED_TODAY' ? 'motion-safe:animate-pet-bounce' :
                tier === 'AT_RISK'         ? 'motion-safe:animate-breathe'    : ''
              }`}
              aria-hidden
            >
              {plantLvl.emoji}
            </span>
            <span
              className="text-[34px] font-bold tabular-nums leading-none"
              style={{ color: TEXT_COLORS[tier] }}
            >
              {current}
            </span>
          </>
        ) : (
          <span className="text-[30px] leading-none select-none motion-safe:animate-breathe" aria-hidden>
            {plantLvl.emoji}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Widget ────────────────────────────────────────────────────────────────────
interface StreakWidgetProps {
  streak: StreakData | null
  isLoading: boolean
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`w-3.5 h-3.5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="4 6 8 10 12 6" />
    </svg>
  )
}

export function StreakWidget({ streak, isLoading }: StreakWidgetProps) {
  const [guideOpen, setGuideOpen] = useState(false)

  if (isLoading) {
    return (
      <div
        className="rounded-3xl p-5 animate-pulse"
        style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f9fafb 100%)', border: '1px solid #e5e7eb', height: 148 }}
      />
    )
  }

  const tier: DisplayTier = streak?.displayTier ?? 'INACTIVE'
  const current   = streak?.current ?? 0
  const best      = streak?.best ?? 0
  const localHour = streak?.localHour ?? new Date().getHours()
  const hoursLeft = 24 - localHour

  // Ring label below the ring
  const ringLabel =
    tier === 'INACTIVE' ? 'start!' :
    tier === 'BROKEN'   ? 'ended'  : 'days'

  // Right-side text
  const headline =
    tier === 'INACTIVE' ? 'Start your streak' :
    tier === 'BROKEN'   ? 'Streak ended' :
    `${current}-day streak`

  const statusText =
    tier === 'COMPLETED_TODAY' ? 'Locked in for today 🎯' :
    tier === 'PENDING_TODAY'   ? "Post today's workout to keep going" :
    tier === 'AT_RISK'         ? (hoursLeft <= 1 ? 'Less than 1h left — go now!' : `${hoursLeft}h left tonight`) :
    tier === 'BROKEN'          ? `You had a ${best}-day streak. Start fresh today.` :
    'Post your first workout today'

  const isPersonalBest = tier === 'COMPLETED_TODAY' && current === best && current > 1
  const nextMilestone  = current > 0 ? getNextMilestone(current) : null
  const showCTA        = tier !== 'COMPLETED_TODAY' && tier !== 'INACTIVE'
  const showStartCTA   = tier === 'INACTIVE'
  const ctaLabel       = tier === 'AT_RISK' ? '⚡ Post now' : '+ Log workout'

  const plantLvl      = getPlantLevel(current)
  const nextPlantLvl  = current > 0 ? PLANT_LEVELS[plantLvl.level + 1] ?? null : PLANT_LEVELS[1] ?? null
  const daysToNext    = nextPlantLvl && plantLvl.nextAt !== Infinity ? plantLvl.nextAt - current : null

  const borderColor = (CARD_STYLE[tier].border as string).replace('1px solid ', '')

  return (
    <div
      className="rounded-3xl transition-all duration-200 hover:scale-[1.005] select-none"
      style={CARD_STYLE[tier]}
    >
      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-5">

          {/* Left column: ring + "days" label below */}
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <StreakRing current={current} tier={tier} />
            <span
              className="text-[11px] font-semibold leading-none"
              style={{ color: TEXT_COLORS[tier] }}
            >
              {ringLabel}
            </span>
          </div>

          {/* Right column: text info */}
          <div className="flex-1 min-w-0 space-y-1">
            {/* Headline + personal best badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[17px] font-bold text-gray-900 leading-tight">
                {headline}
              </span>
              {isPersonalBest && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                  🏆 Best ever
                </span>
              )}
            </div>

            {/* Status — primary motivational line */}
            <p className="text-sm leading-snug" style={{ color: TEXT_COLORS[tier] }}>
              {statusText}
            </p>

            {/* Best streak + upcoming milestone */}
            {best > 0 && tier !== 'BROKEN' && tier !== 'INACTIVE' && (
              <p className="text-xs text-gray-400">
                Best: <span className="font-semibold text-gray-600">{best}</span>
                {nextMilestone && tier === 'COMPLETED_TODAY' && (
                  <> · Next milestone: <span className="font-semibold text-gray-700">{nextMilestone}d</span></>
                )}
              </p>
            )}

            {/* Plant evolution teaser */}
            {current > 0 && daysToNext !== null && tier !== 'BROKEN' && (
              <p className="text-xs text-gray-500">
                <span className="motion-safe:animate-plant-sway inline-block" aria-hidden>{plantLvl.emoji}</span>
                {' '}<span className="font-medium text-gray-700">{plantLvl.name}</span>
                <span className="text-gray-400"> · {daysToNext}d to {nextPlantLvl?.emoji}</span>
              </p>
            )}

            {/* Action row */}
            <div className="flex items-center gap-2 pt-0.5 flex-wrap">
              {(showCTA || showStartCTA) && (
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-1 bg-brand-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-full hover:bg-brand-600 active:scale-95 transition-all shadow-[0_2px_10px_rgba(34,197,94,0.35)]"
                >
                  {showStartCTA ? '+ Start streak' : ctaLabel}
                </Link>
              )}

              <button
                onClick={() => setGuideOpen(v => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors py-1 px-2 rounded-lg hover:bg-black/[0.04] active:scale-95"
                aria-expanded={guideOpen}
                aria-label={guideOpen ? 'Close evolution guide' : 'See evolution guide'}
              >
                {guideOpen ? 'Close guide' : 'Evolution guide'}
                <ChevronIcon open={guideOpen} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Evolution guide ───────────────────────────────────────────── */}
      {guideOpen && (
        <div
          className="px-5 pb-5 border-t animate-float-up"
          style={{ borderColor }}
        >
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Plant Evolution
              </p>
              <p className="text-[10px] text-gray-400">
                {current} day{current !== 1 ? 's' : ''} · Lv.{plantLvl.level}
              </p>
            </div>
            <EvolutionGuide currentDays={current} variant="full" />
          </div>
        </div>
      )}
    </div>
  )
}
