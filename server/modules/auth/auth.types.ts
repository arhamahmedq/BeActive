export interface SignupInput {
  email: string
  username: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface AuthUser {
  id: string
  email: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  timezone: string
  onboarded: boolean
  createdAt: Date
}

export interface AuthSession {
  expiresAt: string
  userId: string
}

export type SignupStatus = 'PENDING_VERIFICATION' | 'VERIFICATION_RESENT'

export interface SignupStatusResult {
  status: SignupStatus
}

export interface LoginResult {
  user: AuthUser
  session: AuthSession
}
