// Pure fetch wrappers for the public profile API (Slice 8A) — no React logic.
import { ApiError } from './friends.api'
import type { PublicProfileResponse, ProfilePostsResponse } from '@/shared/types/profile'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
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

export function fetchProfile(username: string): Promise<PublicProfileResponse> {
  return getJson(`/api/users/${encodeURIComponent(username)}`)
}

export function fetchProfilePosts(
  username: string,
  cursor?: string,
): Promise<ProfilePostsResponse> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return getJson(`/api/users/${encodeURIComponent(username)}/posts${qs}`)
}
