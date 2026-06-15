// Shared gating for the story-card share surface (StoryShareButton).
// GET /api/stories/{postId} enforces owner+VERIFIED server-side (404 otherwise) —
// this mirrors that rule on the client so we never render a button that 404s.

export interface StorySharePost {
  status: string
  user?: { id: string } | null
}

export function canShowStoryShare(
  viewerId: string | null | undefined,
  post: StorySharePost
): boolean {
  if (!viewerId) return false
  if (post.status !== 'VERIFIED') return false
  return post.user?.id === viewerId
}

// True only when `postCreatedAt` falls on the user's most recent verified day
// (`lastVerifiedDate`, "YYYY-MM-DD" in their tz, from the streak API). Used to
// gate the story-share button to the LATEST day's post: once the user posts
// again, older posts stop showing a share button so the feed isn't cluttered
// with a share surface on every past post. Returns false while we don't yet
// know the latest day (null/undefined), so nothing shares prematurely.
export function isLatestVerifiedDayPost(
  postCreatedAt: string,
  lastVerifiedDate: string | null | undefined,
  timezone: string | null | undefined
): boolean {
  if (!lastVerifiedDate) return false
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(postCreatedAt))
    const y = parts.find((p) => p.type === 'year')?.value
    const m = parts.find((p) => p.type === 'month')?.value
    const d = parts.find((p) => p.type === 'day')?.value
    if (!y || !m || !d) return false
    return `${y}-${m}-${d}` === lastVerifiedDate
  } catch {
    return false
  }
}
