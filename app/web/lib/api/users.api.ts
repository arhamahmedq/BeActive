// Pure fetch wrapper for user search — no React logic.
import { ApiError } from './friends.api'

export interface UserSearchResult {
  id: string
  username: string
  avatarUrl: string | null
}

export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) {
    let code: string | undefined
    try {
      const body = await res.clone().json() as { error?: { code?: string } }
      code = body.error?.code
    } catch {
      // ignore
    }
    throw new ApiError(res.status, code)
  }
  const data = await res.json() as { users: UserSearchResult[] }
  return data.users
}
