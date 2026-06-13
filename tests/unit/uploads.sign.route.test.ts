import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

vi.mock('@/server/core/middleware/auth', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/server/core/middleware/rateLimit', () => ({
  uploadUserRateLimit: vi.fn(),
}))

vi.mock('@/server/core/middleware/validate', () => ({
  validateBody: vi.fn(),
}))

vi.mock('@/lib/storage/r2', () => ({
  createSignedUploadUrl: vi.fn(),
}))

vi.mock('@/server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

import { POST } from '../../app/web/app/api/uploads/sign/route'
import { requireAuth } from '@/server/core/middleware/auth'
import { uploadUserRateLimit } from '@/server/core/middleware/rateLimit'
import { validateBody } from '@/server/core/middleware/validate'
import { createSignedUploadUrl } from '@/lib/storage/r2'
import { logger } from '@/server/core/logger/index'
import * as Sentry from '@sentry/nextjs'

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest
}

describe('POST /api/uploads/sign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user-1' })
    vi.mocked(uploadUserRateLimit).mockResolvedValue(null)
    vi.mocked(validateBody).mockResolvedValue({
      mimeType: 'image/jpeg',
      fileSize: 1_000_000,
      kind: 'post',
    })
  })

  it('returns the presigned URL and key on success', async () => {
    vi.mocked(createSignedUploadUrl).mockResolvedValue({
      uploadUrl: 'https://r2.example.com/presigned',
      key: 'posts/user-1/abc.jpg',
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      uploadUrl: 'https://r2.example.com/presigned',
      key: 'posts/user-1/abc.jpg',
    })
  })

  it('returns the auth response when requireAuth fails', async () => {
    const unauthorized = NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    vi.mocked(requireAuth).mockResolvedValue(unauthorized)

    const res = await POST(makeRequest())

    expect(res.status).toBe(401)
    expect(createSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('returns 500 INTERNAL_ERROR and reports to Sentry on an unexpected error', async () => {
    vi.mocked(createSignedUploadUrl).mockRejectedValue(new Error('R2_PUBLIC_URL env var is missing'))

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    })
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'R2_PUBLIC_URL env var is missing' })
    )
    expect(logger.error).toHaveBeenCalledWith('uploads/sign: unexpected error', {
      userId: 'user-1',
      error: expect.stringContaining('R2_PUBLIC_URL env var is missing'),
    })
  })
})
