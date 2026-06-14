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
