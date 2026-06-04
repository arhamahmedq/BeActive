// Pure fetch wrappers for the Friends API — no React logic.
// All types are local extensions of the server contract to include
// runtime-present fields not yet in the shared type (friendshipId).

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string
  ) {
    super(`API error ${status}`)
  }
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (!res.ok) {
    let code: string | undefined
    try {
      const body = await res.clone().json() as { error?: { code?: string } }
      code = body.error?.code
    } catch {
      // ignore parse error
    }
    throw new ApiError(res.status, code)
  }
  return res
}

// ---------------------------------------------------------------------------
// Extended client-side types
// The backend GET /api/friends includes friendshipId at runtime even though
// the shared FriendUser type does not declare it. Typed here for the frontend.
// ---------------------------------------------------------------------------

export interface FriendClient {
  id: string
  friendshipId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  streak: { current: number }
}

export interface FriendsListClient {
  friends: FriendClient[]
}

export interface PendingFriendEntry {
  friendshipId: string
  user: { id: string; username: string; avatarUrl: string | null }
}

export interface PendingFriendsClient {
  incoming: PendingFriendEntry[]
  outgoing: PendingFriendEntry[]
}

export interface FriendshipMutation {
  friendship: { id: string; status: string }
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchFriends(): Promise<FriendsListClient> {
  const res = await apiFetch('/api/friends')
  return res.json() as Promise<FriendsListClient>
}

export async function fetchPendingFriends(): Promise<PendingFriendsClient> {
  const res = await apiFetch('/api/friends/pending')
  return res.json() as Promise<PendingFriendsClient>
}

export async function lookupFriendshipId(userId: string): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/friends/lookup?userId=${encodeURIComponent(userId)}`)
    const data = await res.json() as { friendshipId: string }
    return data.friendshipId
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function sendFriendRequest(targetUserId: string): Promise<FriendshipMutation> {
  const res = await apiFetch('/api/friends/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  })
  return res.json() as Promise<FriendshipMutation>
}

export async function acceptFriendRequest(friendshipId: string): Promise<FriendshipMutation> {
  const res = await apiFetch('/api/friends/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendshipId }),
  })
  return res.json() as Promise<FriendshipMutation>
}

export async function rejectFriendRequest(friendshipId: string): Promise<void> {
  await apiFetch('/api/friends/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendshipId }),
  })
}

export async function removeFriend(friendUserId: string): Promise<void> {
  // Resolve friendship ID first (lookup endpoint), then remove.
  const friendshipId = await lookupFriendshipId(friendUserId)
  if (!friendshipId) return // already removed or never friends
  await apiFetch('/api/friends/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendshipId }),
  })
}
