'use client'
import { useState, useEffect } from 'react'

export type TimerStatus = 'INACTIVE' | 'ACTIVE' | 'AT_RISK' | 'BROKEN'

export interface StreakTimerResult {
  hh: string
  mm: string
  ss: string
  computedStatus: TimerStatus
  totalSecondsLeft: number
}

export function computeTimerStatus(
  nextDeadline: string | null,
  atRiskAt: string | null,
  nowMs: number
): TimerStatus {
  if (!nextDeadline) return 'INACTIVE'
  if (!atRiskAt) return 'ACTIVE'
  if (nowMs >= new Date(nextDeadline).getTime()) return 'BROKEN'
  if (nowMs >= new Date(atRiskAt).getTime()) return 'AT_RISK'
  return 'ACTIVE'
}

export function formatSeconds(totalSeconds: number): { hh: string; mm: string; ss: string } {
  const s = Math.max(0, totalSeconds)
  return {
    hh: String(Math.floor(s / 3600)).padStart(2, '0'),
    mm: String(Math.floor((s % 3600) / 60)).padStart(2, '0'),
    ss: String(s % 60).padStart(2, '0'),
  }
}

export function useStreakTimer(
  nextDeadline: string | null,
  atRiskAt: string | null
): StreakTimerResult {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!nextDeadline) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [nextDeadline])

  if (!nextDeadline) {
    return { hh: '00', mm: '00', ss: '00', computedStatus: 'INACTIVE', totalSecondsLeft: 0 }
  }

  const totalSecondsLeft = Math.max(
    0,
    Math.floor((new Date(nextDeadline).getTime() - nowMs) / 1000)
  )

  return {
    ...formatSeconds(totalSecondsLeft),
    computedStatus: computeTimerStatus(nextDeadline, atRiskAt, nowMs),
    totalSecondsLeft,
  }
}
