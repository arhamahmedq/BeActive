// Shared constants used across frontend and backend
// Populated as each slice is built

export const STREAK_AT_RISK_HOURS = 20
export const STREAK_BROKEN_HOURS = 24
export const AI_CONFIDENCE_THRESHOLD = 0.70
export const AI_AMBIGUOUS_THRESHOLD = 0.50
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_BIO_LENGTH = 160
export const MAX_CAPTION_LENGTH = 500

// Feed (Slice 5)
export const FEED_RECENCY_HALFLIFE_HOURS = 24
export const FEED_STREAK_BOOST_DIVISOR = 100
export const FEED_STREAK_BOOST_CAP = 0.5
export const FEED_WINDOW_DAYS = 30
export const FEED_CANDIDATE_CAP = 500
export const FEED_DEFAULT_LIMIT = 20
export const FEED_MAX_LIMIT = 50
