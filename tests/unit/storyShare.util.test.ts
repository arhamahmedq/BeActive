import { describe, it, expect } from 'vitest'
import { canShowStoryShare } from '../../shared/utils/storyShare'

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
