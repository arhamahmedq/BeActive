import { describe, it, expect } from 'vitest'
import { canShowStoryShare, isLatestVerifiedDayPost } from '../../shared/utils/storyShare'

describe('canShowStoryShare', () => {
  const owner = { id: 'user-1' }
  const verifiedOwnedPost = { status: 'VERIFIED', user: owner }

  it('allows the owner of a VERIFIED post', () => {
    expect(canShowStoryShare('user-1', verifiedOwnedPost)).toBe(true)
  })

  it('rejects a non-owner viewing a VERIFIED post', () => {
    expect(canShowStoryShare('user-2', verifiedOwnedPost)).toBe(false)
  })

  it('rejects the owner when the post is PENDING', () => {
    expect(canShowStoryShare('user-1', { status: 'PENDING', user: owner })).toBe(false)
  })

  it('rejects the owner when the post is REJECTED', () => {
    expect(canShowStoryShare('user-1', { status: 'REJECTED', user: owner })).toBe(false)
  })

  it('rejects when viewerId is missing', () => {
    expect(canShowStoryShare(null, verifiedOwnedPost)).toBe(false)
    expect(canShowStoryShare(undefined, verifiedOwnedPost)).toBe(false)
  })

  it('rejects when the post has no user', () => {
    expect(canShowStoryShare('user-1', { status: 'VERIFIED', user: null })).toBe(false)
    expect(canShowStoryShare('user-1', { status: 'VERIFIED' })).toBe(false)
  })
})

describe('isLatestVerifiedDayPost', () => {
  it('allows a post made on the most recent verified day (same tz date)', () => {
    expect(isLatestVerifiedDayPost('2026-06-15T12:00:00Z', '2026-06-15', 'UTC')).toBe(true)
  })

  it('rejects a post from an earlier day than the latest verified day', () => {
    expect(isLatestVerifiedDayPost('2026-06-14T12:00:00Z', '2026-06-15', 'UTC')).toBe(false)
  })

  it('compares the date in the user timezone, not UTC', () => {
    // 03:00Z on the 15th is still the 14th, 23:00 in New York (EDT, UTC-4).
    expect(isLatestVerifiedDayPost('2026-06-15T03:00:00Z', '2026-06-14', 'America/New_York')).toBe(true)
    expect(isLatestVerifiedDayPost('2026-06-15T03:00:00Z', '2026-06-15', 'America/New_York')).toBe(false)
  })

  it('falls back to UTC when no timezone is provided', () => {
    expect(isLatestVerifiedDayPost('2026-06-15T12:00:00Z', '2026-06-15', undefined)).toBe(true)
  })

  it('rejects when there is no known latest verified day', () => {
    expect(isLatestVerifiedDayPost('2026-06-15T12:00:00Z', null, 'UTC')).toBe(false)
    expect(isLatestVerifiedDayPost('2026-06-15T12:00:00Z', undefined, 'UTC')).toBe(false)
  })

  it('rejects an unparseable timestamp without throwing', () => {
    expect(isLatestVerifiedDayPost('not-a-date', '2026-06-15', 'UTC')).toBe(false)
  })
})
