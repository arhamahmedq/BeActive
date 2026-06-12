import type { NextConfig } from 'next'
import path from 'path'
import { withSentryConfig } from '@sentry/nextjs'

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
  // Content-Security-Policy is set per-request in proxy.ts (nonce-based script-src)
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
