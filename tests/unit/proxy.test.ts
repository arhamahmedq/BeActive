import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUserMock = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: getUserMock },
  })),
}))

import { proxy } from '../../app/web/proxy'

function makeRequest(path: string): NextRequest {
  return new NextRequest(`https://app.example.com${path}`)
}

function scriptSrc(csp: string | null): string | undefined {
  return csp?.split('; ').find((d) => d.startsWith('script-src'))
}

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  })

  it('sets a nonce-based Content-Security-Policy on a pass-through response', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const res = await proxy(makeRequest('/'))
    const csp = res.headers.get('Content-Security-Policy')

    expect(scriptSrc(csp)).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'$/)
  })

  it('generates a different nonce for each request', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const res1 = await proxy(makeRequest('/'))
    const res2 = await proxy(makeRequest('/'))

    const nonce1 = scriptSrc(res1.headers.get('Content-Security-Policy'))?.match(/nonce-([^']+)/)?.[1]
    const nonce2 = scriptSrc(res2.headers.get('Content-Security-Policy'))?.match(/nonce-([^']+)/)?.[1]

    expect(nonce1).toBeTruthy()
    expect(nonce1).not.toBe(nonce2)
  })

  it('redirects unauthenticated requests to protected paths with the CSP header set', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const res = await proxy(makeRequest('/feed'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('redirectTo=%2Ffeed')
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy()
  })

  it('redirects authenticated requests away from auth paths with the CSP header set', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const res = await proxy(makeRequest('/login'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/feed')
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy()
  })

  it('allows authenticated requests to protected paths through with the CSP header set', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const res = await proxy(makeRequest('/feed'))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy()
  })
})
