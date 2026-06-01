import { describe, it, expect } from 'vitest'
import { computeTimerStatus, formatSeconds } from '../../../app/web/hooks/useStreakTimer'

describe('computeTimerStatus', () => {
  it('returns INACTIVE when nextDeadline is null', () => {
    expect(computeTimerStatus(null, null, Date.now())).toBe('INACTIVE')
  })

  it('returns ACTIVE when now is well before atRiskAt', () => {
    const now = new Date('2024-01-15T10:00:00Z').getTime()
    const atRiskAt = new Date('2024-01-16T06:00:00Z').toISOString()
    const nextDeadline = new Date('2024-01-16T10:00:00Z').toISOString()
    expect(computeTimerStatus(nextDeadline, atRiskAt, now)).toBe('ACTIVE')
  })

  it('returns AT_RISK when now is past atRiskAt but before nextDeadline', () => {
    const now = new Date('2024-01-16T08:00:00Z').getTime()
    const atRiskAt = new Date('2024-01-16T06:00:00Z').toISOString()
    const nextDeadline = new Date('2024-01-16T10:00:00Z').toISOString()
    expect(computeTimerStatus(nextDeadline, atRiskAt, now)).toBe('AT_RISK')
  })

  it('returns BROKEN when now is past nextDeadline', () => {
    const now = new Date('2024-01-16T11:00:00Z').getTime()
    const atRiskAt = new Date('2024-01-16T06:00:00Z').toISOString()
    const nextDeadline = new Date('2024-01-16T10:00:00Z').toISOString()
    expect(computeTimerStatus(nextDeadline, atRiskAt, now)).toBe('BROKEN')
  })

  it('returns BROKEN at the exact deadline millisecond', () => {
    const nextDeadline = new Date('2024-01-16T10:00:00Z').toISOString()
    const atRiskAt = new Date('2024-01-16T06:00:00Z').toISOString()
    const now = new Date('2024-01-16T10:00:00Z').getTime()
    expect(computeTimerStatus(nextDeadline, atRiskAt, now)).toBe('BROKEN')
  })
})

describe('formatSeconds', () => {
  it('formats zero as 00:00:00', () => {
    expect(formatSeconds(0)).toEqual({ hh: '00', mm: '00', ss: '00' })
  })

  it('formats 3661 seconds as 01:01:01', () => {
    expect(formatSeconds(3661)).toEqual({ hh: '01', mm: '01', ss: '01' })
  })

  it('formats 86399 seconds (23:59:59)', () => {
    expect(formatSeconds(86399)).toEqual({ hh: '23', mm: '59', ss: '59' })
  })

  it('pads single-digit values with leading zeros', () => {
    expect(formatSeconds(65)).toEqual({ hh: '00', mm: '01', ss: '05' })
  })

  it('clamps negative input to 00:00:00', () => {
    expect(formatSeconds(-100)).toEqual({ hh: '00', mm: '00', ss: '00' })
  })
})
