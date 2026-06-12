import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/server/workers/aiClassifier', () => ({
  processUploadedPost: vi.fn(),
}))

vi.mock('@/server/core/queue/qstash', () => ({
  verifyClassificationJobSignature: vi.fn(),
}))

vi.mock('@/server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { POST } from '../../app/web/app/api/queue/classify/route'
import { processUploadedPost } from '@/server/workers/aiClassifier'
import { verifyClassificationJobSignature } from '@/server/core/queue/qstash'

function makeRequest(body: string, signature: string | null = 'valid-sig'): NextRequest {
  return {
    url: 'https://app.example.com/api/queue/classify',
    headers: {
      get: (name: string) => (name.toLowerCase() === 'upstash-signature' ? signature : null),
    },
    text: () => Promise.resolve(body),
  } as unknown as NextRequest
}

const VALID_PAYLOAD = {
  postId: 'post-1',
  imageUrl: 'https://r2.example.com/posts/post-1.jpg',
  userId: 'user-1',
  correlationId: 'post-1',
}

describe('POST /api/queue/classify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when signature verification fails', async () => {
    vi.mocked(verifyClassificationJobSignature).mockResolvedValue(false)

    const res = await POST(makeRequest(JSON.stringify(VALID_PAYLOAD)))

    expect(res.status).toBe(401)
    expect(processUploadedPost).not.toHaveBeenCalled()
  })

  it('returns 401 when the signature header is missing', async () => {
    vi.mocked(verifyClassificationJobSignature).mockResolvedValue(false)

    const res = await POST(makeRequest(JSON.stringify(VALID_PAYLOAD), null))

    expect(res.status).toBe(401)
    expect(processUploadedPost).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid JSON body', async () => {
    vi.mocked(verifyClassificationJobSignature).mockResolvedValue(true)

    const res = await POST(makeRequest('not json'))

    expect(res.status).toBe(400)
    expect(processUploadedPost).not.toHaveBeenCalled()
  })

  it('returns 400 when the body fails schema validation', async () => {
    vi.mocked(verifyClassificationJobSignature).mockResolvedValue(true)

    const res = await POST(makeRequest(JSON.stringify({ postId: 'post-1' })))

    expect(res.status).toBe(400)
    expect(processUploadedPost).not.toHaveBeenCalled()
  })

  it('calls processUploadedPost with the validated payload and returns 200', async () => {
    vi.mocked(verifyClassificationJobSignature).mockResolvedValue(true)
    vi.mocked(processUploadedPost).mockResolvedValue(undefined)

    const res = await POST(makeRequest(JSON.stringify(VALID_PAYLOAD)))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(processUploadedPost).toHaveBeenCalledWith(VALID_PAYLOAD)
  })

  it('returns 500 if processUploadedPost throws', async () => {
    vi.mocked(verifyClassificationJobSignature).mockResolvedValue(true)
    vi.mocked(processUploadedPost).mockRejectedValue(new Error('db unreachable'))

    const res = await POST(makeRequest(JSON.stringify(VALID_PAYLOAD)))

    expect(res.status).toBe(500)
  })
})
