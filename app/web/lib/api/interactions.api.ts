// Pure fetch wrappers for post engagement (Slice 8B) — no React logic.
import { ApiError } from './friends.api'
import type { LikeMutationResponse, CommentsResponse, PostCommentDTO } from '@/shared/types/interactions'

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let code: string | undefined
    try {
      const body = (await res.clone().json()) as { error?: { code?: string } }
      code = body.error?.code
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(res.status, code)
  }
  return res.json() as Promise<T>
}

export function likePost(postId: string): Promise<LikeMutationResponse> {
  return send(`/api/posts/${encodeURIComponent(postId)}/like`, { method: 'POST' })
}

export function unlikePost(postId: string): Promise<LikeMutationResponse> {
  return send(`/api/posts/${encodeURIComponent(postId)}/like`, { method: 'DELETE' })
}

export function fetchComments(postId: string, cursor?: string): Promise<CommentsResponse> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return send(`/api/posts/${encodeURIComponent(postId)}/comments${qs}`)
}

export async function addComment(postId: string, body: string): Promise<PostCommentDTO> {
  const data = await send<{ comment: PostCommentDTO }>(
    `/api/posts/${encodeURIComponent(postId)}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    },
  )
  return data.comment
}
