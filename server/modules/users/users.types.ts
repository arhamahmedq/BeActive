export interface UserProfile {
  id: string
  email: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  timezone: string
  onboarded: boolean
  createdAt: Date
}

export interface UpdateProfileInput {
  displayName?: string | null
  timezone?: string
  bio?: string | null
}

// --- Public profile (Slice 8A) repo row shapes ---

export interface ProfileUserRow {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  streak: { current: number; best: number } | null
}

export interface ProfilePostRow {
  id: string
  imageUrl: string
  caption: string | null
  createdAt: Date
  user: { id: string; username: string; avatarUrl: string | null; streak: { current: number } | null }
  workout: { type: string } | null
}
