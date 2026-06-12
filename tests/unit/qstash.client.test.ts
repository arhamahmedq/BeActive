import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Hoisted mocks referenced by closure inside the @upstash/qstash factory —
// stable across vi.resetModules() so call-count/argument assertions survive
// re-imports of the module under test.
const publishJSONMock = vi.fn()
const verifyMock = vi.fn()

vi.mock('@upstash/qstash', () => ({
  Client: class MockClient {
    publishJSON = publishJSONMock
    constructor(_opts: unknown) {}
  },
  Receiver: class MockReceiver {
    verify = verifyMock
    constructor(_opts: unknown) {}
  },
}))

vi.mock('../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const ORIGINAL_ENV = { ...process.env }

describe('QStash client wrapper', () => {
  beforeEach(() => {
    vi.resetModules()
    publishJSONMock.mockReset()
    verifyMock.mockReset()
    delete process.env.QSTASH_TOKEN
    delete process.env.QSTASH_CURRENT_SIGNING_KEY
    delete process.env.QSTASH_NEXT_SIGNING_KEY
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  describe('enqueueClassificationJob', () => {
    it('returns false without calling QStash when QSTASH_TOKEN is unset', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
      const { enqueueClassificationJob } = await import('../../server/core/queue/qstash')

      const result = await enqueueClassificationJob({
        postId: 'post-1',
        imageUrl: 'https://r2.example.com/posts/post-1.jpg',
        userId: 'user-1',
      })

      expect(result).toBe(false)
      expect(publishJSONMock).not.toHaveBeenCalled()
    })

    it('returns false without calling QStash when NEXT_PUBLIC_APP_URL is unset', async () => {
      process.env.QSTASH_TOKEN = 'qstash-token'
      const { enqueueClassificationJob } = await import('../../server/core/queue/qstash')

      const result = await enqueueClassificationJob({
        postId: 'post-1',
        imageUrl: 'https://r2.example.com/posts/post-1.jpg',
        userId: 'user-1',
      })

      expect(result).toBe(false)
      expect(publishJSONMock).not.toHaveBeenCalled()
    })

    it('publishes to /api/queue/classify with the job payload and returns true', async () => {
      process.env.QSTASH_TOKEN = 'qstash-token'
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
      publishJSONMock.mockResolvedValue({ messageId: 'msg-1' })
      const { enqueueClassificationJob } = await import('../../server/core/queue/qstash')

      const payload = {
        postId: 'post-1',
        imageUrl: 'https://r2.example.com/posts/post-1.jpg',
        userId: 'user-1',
        correlationId: 'post-1',
      }
      const result = await enqueueClassificationJob(payload)

      expect(result).toBe(true)
      expect(publishJSONMock).toHaveBeenCalledWith({
        url: 'https://app.example.com/api/queue/classify',
        body: payload,
      })
    })

    it('returns false and does not throw if publishJSON rejects', async () => {
      process.env.QSTASH_TOKEN = 'qstash-token'
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
      publishJSONMock.mockRejectedValue(new Error('network error'))
      const { enqueueClassificationJob } = await import('../../server/core/queue/qstash')

      const result = await enqueueClassificationJob({
        postId: 'post-1',
        imageUrl: 'https://r2.example.com/posts/post-1.jpg',
        userId: 'user-1',
      })

      expect(result).toBe(false)
    })
  })

  describe('verifyClassificationJobSignature', () => {
    it('returns false without verifying when signing keys are unset', async () => {
      const { verifyClassificationJobSignature } = await import('../../server/core/queue/qstash')

      const result = await verifyClassificationJobSignature('sig', '{}', 'https://app.example.com/api/queue/classify')

      expect(result).toBe(false)
      expect(verifyMock).not.toHaveBeenCalled()
    })

    it('returns false without verifying when the signature header is missing', async () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key'
      process.env.QSTASH_NEXT_SIGNING_KEY = 'next-key'
      const { verifyClassificationJobSignature } = await import('../../server/core/queue/qstash')

      const result = await verifyClassificationJobSignature(null, '{}', 'https://app.example.com/api/queue/classify')

      expect(result).toBe(false)
      expect(verifyMock).not.toHaveBeenCalled()
    })

    it('returns true when Receiver.verify resolves true', async () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key'
      process.env.QSTASH_NEXT_SIGNING_KEY = 'next-key'
      verifyMock.mockResolvedValue(true)
      const { verifyClassificationJobSignature } = await import('../../server/core/queue/qstash')

      const result = await verifyClassificationJobSignature('sig', '{"postId":"post-1"}', 'https://app.example.com/api/queue/classify')

      expect(result).toBe(true)
      expect(verifyMock).toHaveBeenCalledWith({
        signature: 'sig',
        body: '{"postId":"post-1"}',
        url: 'https://app.example.com/api/queue/classify',
      })
    })

    it('returns false (not throw) when Receiver.verify throws SignatureError', async () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key'
      process.env.QSTASH_NEXT_SIGNING_KEY = 'next-key'
      verifyMock.mockRejectedValue(new Error('signature is invalid'))
      const { verifyClassificationJobSignature } = await import('../../server/core/queue/qstash')

      const result = await verifyClassificationJobSignature('bad-sig', '{}', 'https://app.example.com/api/queue/classify')

      expect(result).toBe(false)
    })
  })
})
