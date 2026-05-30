// Auth types shared between frontend and backend
export interface AuthUser {
  id: string
  email: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  activityState: string
  onboarded: boolean
  createdAt: string // ISO string (JSON-safe)
}

export interface AuthSession {
  expiresAt: string
  userId: string
}
