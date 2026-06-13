import type { NextConfig } from 'next'
import path from 'path'
import { withSentryConfig } from '@sentry/nextjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const r2PublicUrl = process.env.R2_PUBLIC_URL ?? ''

const securityHeaders = [
  // Prevent DNS prefetch leaking URLs
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Enforce HTTPS for 2 years
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Prevent clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME-sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Control referrer info
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera access required for workout photo capture on upload page
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js requires unsafe-inline for hydration; tighten with nonces post-MVP
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      // Supabase auth API + storage; wildcard covers R2 presigned upload endpoints
      `connect-src 'self' ${supabaseUrl} https://*.supabase.co wss://*.supabase.co https://*.r2.cloudflarestorage.com`,
      // R2 CDN for user-uploaded images (avatars, workout photos)
      `img-src 'self' blob: data: ${r2PublicUrl}`,
      "font-src 'self'",
      // Block all embedding
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  // Tell Turbopack which directory is the project root so it picks the correct
  // lockfile when multiple lockfiles exist in the monorepo (root vs app/web).
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: {
    autoInstrumentServerFunctions: false,
  },
})
