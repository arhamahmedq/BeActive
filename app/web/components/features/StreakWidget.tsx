'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { StreakData, DisplayTier } from '@/hooks/useStreak'
import { getPlantLevel, getPlantLevelProgress, PLANT_LEVELS } from '@/lib/streak-levels'
import { EvolutionGuide } from './EvolutionGuide'

// ── Milestone ring progress (separate from plant evolution ladder) ────────────
// Ring fills from the last milestone toward the next (7→30→100→365→...)
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

// ── Circular ring ────────────────────────────────────────────────────────────
const RING_SIZE = 88
const CX = 44; const CY = 44; const R = 32; const STROKE = 5.5
const CIRC = 2 * Math.PI * R

function StreakRing({ current, tier }: { current: number; tier: DisplayTier }) {
  const progress = getRingProgress(current, tier)
  const offset   = CIRC * (1 - Math.max(0, Math.min(1, progress)))
  const showNumber = tier !== 'INACTIVE' && tier !== 'BROKEN'
  const plantLvl = getPlantLevel(current)

  return (
    <div className="relative flex-shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg
        width={RING_SIZE} height={RING_SIZE}
        className={`-rotate-90 ${tier === 'AT_RISK' ? 'motion-safe:animate-streak-pulse' : ''}`}
        aria-hidden
      >
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={RING_TRACK[tier]} strokeWidth={STROKE} />
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
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className={`text-lg leading-none select-none ${
            tier === 'COMPLETED_TODAY' ? 'motion-safe:animate-pet-bounce' :
            tier === 'AT_RISK'         ? 'motion-safe:animate-breathe'    : ''
          }`}
          aria-hidden
        >
          {plantLvl.emoji}
        </span>
        {showNumber ? (
          <>
            <span className="text-2xl font-bold tabular-nums leading-none mt-0.5" style={{ color: TEXT_COLORS[tier] }}>
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
    return <div className="rounded-2xl p-5 animate-pulse h-24 bg-gray-100" />
  }

  const tier: DisplayTier = streak?.displayTier ?? 'INACTIVE'
  const current = streak?.current ?? 0
  const best    = streak?.best ?? 0
  const localHour = streak?.localHour ?? new Date().getHours()
  const hoursLeft = 24 - localHour

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
  const showCTA = tier !== 'COMPLETED_TODAY' && tier !== 'INACTIVE'
  const showStartCTA = tier === 'INACTIVE'
  const ctaLabel = tier === 'AT_RISK' ? '⚡ Post now' : '+ Log workout'

  // Plant level info for the teaser line
  const plantLvl = getPlantLevel(current)
  const nextPlantLvl = current > 0 ? PLANT_LEVELS[plantLvl.level + 1] ?? null : PLANT_LEVELS[1] ?? null
  const daysToNextPlant = nextPlantLvl && plantLvl.nextAt !== Infinity ? plantLvl.nextAt - current : null

  return (
    <div
      className="rounded-2xl shadow-sm transition-all duration-200 hover:shadow-md select-none"
      style={{ background: CARD_BG[tier], border: `1px solid ${CARD_BORDER[tier]}` }}
    >
      {/* ── Main row ─────────────────────────────────────────────────── */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-4">
          <StreakRing current={current} tier={tier} />

          <div className="flex-1 min-w-0">
            {/* Headline + personal best */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-base leading-tight">{headline}</span>
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

            {/* Best + next streak milestone */}
            {best > 0 && tier !== 'BROKEN' && tier !== 'INACTIVE' && (
              <p className="text-xs mt-0.5 text-gray-400">
                Best: <span className="font-medium text-gray-600">{best}</span>
                {nextMilestone && tier === 'COMPLETED_TODAY' && (
                  <> · Milestone: <span className="font-medium text-gray-600">{nextMilestone} days</span></>
                )}
              </p>
            )}

            {/* Plant level teaser — "3 days to next evolution 🌲" */}
            {current > 0 && daysToNextPlant !== null && tier !== 'BROKEN' && (
              <p className="text-[11px] mt-0.5 text-gray-500">
                <span className="motion-safe:animate-plant-sway inline-block" aria-hidden>{plantLvl.emoji}</span>
                {' '}{(plantLvl as { name: string }).name}
                <span className="text-gray-400"> · {daysToNextPlant}d to {nextPlantLvl?.emoji}</span>
              </p>
            )}

            {/* CTAs */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {(showCTA || showStartCTA) && (
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-1 bg-brand-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-brand-600 active:scale-95 transition-all shadow-[0_2px_8px_rgba(34,197,94,0.3)]"
                >
                  {showStartCTA ? '+ Start streak' : ctaLabel}
                </Link>
              )}

              {/* Evolution guide toggle — the key new element */}
              <button
                onClick={() => setGuideOpen(v => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800 transition-colors py-1 px-1.5 rounded-lg hover:bg-black/[0.04] active:scale-95"
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

      {/* ── Evolution guide panel — expands inline ──────────────────── */}
      {guideOpen && (
        <div
          className="px-4 pb-4 border-t animate-float-up"
          style={{ borderColor: CARD_BORDER[tier] }}
        >
          <div className="pt-3">
            {/* Section header */}
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
