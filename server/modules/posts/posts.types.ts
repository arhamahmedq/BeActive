export interface CreatePostInput {
  imageKey: string
  caption?: string | undefined
}

export interface PostUser {
  id: string
  username: string
  avatarUrl: string | null
}

export interface PostWorkout {
  type: string
  aiConfidence: number
}

export interface PostResponse {
  id: string
  imageUrl: string
  imageKey: string
  caption: string | null
  status: string
  createdAt: Date
  user?: PostUser
  workout?: PostWorkout | null
}

export interface SignUploadInput {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  fileSize: number
}
