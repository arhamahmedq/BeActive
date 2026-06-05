// Pure fetch wrapper for a single post (read-only view) — no React logic.
import { ApiError } from './friends.api'

export interface PostDetail {
  id: string
  imageUrl: string
  caption: string | null
  createdAt: string // ISO 8601
  user?: { id: string; username: string; avatarUrl: string | null }
  workout?: { type: string } | null
}

export async function fetchPost(id: string): Promise<PostDetail> {
  const res = await fetch(`/api/posts/${encodeURIComponent(id)}`)
  if (!res.ok) {
    let code: string | undefined
    try {
      const body = (await res.clone().json()) as { error?: { code?: string } }
      code = body.error?.code
    } catch {
      // ignore
    }
    throw new ApiError(res.status, code)
  }
  const data = (await res.json()) as { post: PostDetail }
  return data.post
}
