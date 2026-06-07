import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Capture 10% of transactions for performance monitoring (free tier friendly).
  tracesSampleRate: 0.1,
  // Only enable in production — avoids noise in local dev.
  enabled: process.env.NODE_ENV === 'production',
  // Do not send PII (email, username) in breadcrumbs.
  sendDefaultPii: false,
})
