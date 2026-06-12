import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildContentSecurityPolicy, generateNonce } from '@/lib/csp'

const ORIGINAL_ENV = { ...process.env }

describe('CSP helpers', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  describe('generateNonce', () => {
    it('returns a non-empty base64 string', () => {
      const nonce = generateNonce()

      expect(nonce.length).toBeGreaterThan(0)
      expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/)
    })

    it('returns a different value on each call', () => {
      expect(generateNonce()).not.toBe(generateNonce())
    })
  })

  describe('buildContentSecurityPolicy', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.co'
      process.env.R2_PUBLIC_URL = 'https://cdn.example.com'
    })

    it('embeds the nonce in script-src with strict-dynamic and no unsafe-* keywords', () => {
      const csp = buildContentSecurityPolicy('test-nonce')
      const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src'))

      expect(scriptSrc).toBe("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'")
    })

    it('adds unsafe-eval to script-src in development only', () => {
      process.env.NODE_ENV = 'development'
      const devCsp = buildContentSecurityPolicy('test-nonce')
      expect(devCsp).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic' 'unsafe-eval'")

      process.env.NODE_ENV = 'production'
      const prodCsp = buildContentSecurityPolicy('test-nonce')
      expect(prodCsp).not.toContain('unsafe-eval')
    })

    it('keeps unsafe-inline for style-src', () => {
      expect(buildContentSecurityPolicy('test-nonce')).toContain("style-src 'self' 'unsafe-inline'")
    })

    it('interpolates Supabase and R2 URLs into connect-src and img-src', () => {
      const csp = buildContentSecurityPolicy('test-nonce')

      expect(csp).toContain("connect-src 'self' https://supabase.example.co https://*.supabase.co wss://*.supabase.co https://*.r2.cloudflarestorage.com")
      expect(csp).toContain("img-src 'self' blob: data: https://cdn.example.com")
    })

    it('includes the remaining locked-down directives', () => {
      const csp = buildContentSecurityPolicy('test-nonce')

      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("font-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("base-uri 'self'")
      expect(csp).toContain("form-action 'self'")
    })
  })
})
