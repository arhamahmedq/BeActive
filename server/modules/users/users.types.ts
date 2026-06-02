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
