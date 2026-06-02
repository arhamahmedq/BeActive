import { describe, it, expect } from 'vitest'
import { StreakStatus } from '@prisma/client'
import {
  isValidStreakTransition,
  applyStreakTransition,
} from '../../../server/core/state-machines/streak.machine'

describe('streak state machine — isValidStreakTransition', () => {
  it('allows INACTIVE → ACTIVE', () => {
    expect(isValidStreakTransition(StreakStatus.INACTIVE, StreakStatus.ACTIVE)).toBe(true)
  })
  it('allows ACTIVE → ACTIVE (increment)', () => {
    expect(isValidStreakTransition(StreakStatus.ACTIVE, StreakStatus.ACTIVE)).toBe(true)
  })
  it('allows ACTIVE → BROKEN', () => {
    expect(isValidStreakTransition(StreakStatus.ACTIVE, StreakStatus.BROKEN)).toBe(true)
  })
  it('allows BROKEN → ACTIVE (recovery)', () => {
    expect(isValidStreakTransition(StreakStatus.BROKEN, StreakStatus.ACTIVE)).toBe(true)
  })
  it('rejects INACTIVE → BROKEN', () => {
    expect(isValidStreakTransition(StreakStatus.INACTIVE, StreakStatus.BROKEN)).toBe(false)
  })
  it('rejects BROKEN → BROKEN', () => {
    expect(isValidStreakTransition(StreakStatus.BROKEN, StreakStatus.BROKEN)).toBe(false)
  })
  it('rejects INACTIVE → INACTIVE', () => {
    expect(isValidStreakTransition(StreakStatus.INACTIVE, StreakStatus.INACTIVE)).toBe(false)
  })
})

describe('streak state machine — applyStreakTransition', () => {
  it('sets current=1 best=1 on INACTIVE → ACTIVE', () => {
    const result = applyStreakTransition(
      { current: 0, best: 0, status: StreakStatus.INACTIVE },
      StreakStatus.ACTIVE
    )
    expect(result).toEqual({ current: 1, best: 1, status: StreakStatus.ACTIVE })
  })

  it('preserves best > 0 on INACTIVE → ACTIVE', () => {
    const result = applyStreakTransition(
      { current: 0, best: 5, status: StreakStatus.INACTIVE },
      StreakStatus.ACTIVE
    )
    expect(result.current).toBe(1)
    expect(result.best).toBe(5)
    expect(result.status).toBe(StreakStatus.ACTIVE)
  })

  it('increments current on ACTIVE → ACTIVE', () => {
    const result = applyStreakTransition(
      { current: 5, best: 5, status: StreakStatus.ACTIVE },
      StreakStatus.ACTIVE
    )
    expect(result).toEqual({ current: 6, best: 6, status: StreakStatus.ACTIVE })
  })

  it('preserves best when current is below best', () => {
    const result = applyStreakTransition(
      { current: 3, best: 10, status: StreakStatus.ACTIVE },
      StreakStatus.ACTIVE
    )
    expect(result.current).toBe(4)
    expect(result.best).toBe(10)
  })

  it('resets current=1 on BROKEN → ACTIVE, preserves best', () => {
    const result = applyStreakTransition(
      { current: 7, best: 12, status: StreakStatus.BROKEN },
      StreakStatus.ACTIVE
    )
    expect(result).toEqual({ current: 1, best: 12, status: StreakStatus.ACTIVE })
  })

  it('preserves counter on ACTIVE → BROKEN (no counter change)', () => {
    const result = applyStreakTransition(
      { current: 5, best: 5, status: StreakStatus.ACTIVE },
      StreakStatus.BROKEN
    )
    expect(result).toEqual({ current: 5, best: 5, status: StreakStatus.BROKEN })
  })

  it('throws on invalid transition INACTIVE → BROKEN', () => {
    expect(() =>
      applyStreakTransition({ current: 0, best: 0, status: StreakStatus.INACTIVE }, StreakStatus.BROKEN)
    ).toThrow('Invalid streak transition')
  })
})

