import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkoutType } from '@prisma/client'

// ── Mocks declared before vi.mock factory runs ────────────────────────────────

const mockGenerateContent = vi.fn()
const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }))

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel = mockGetGenerativeModel
  },
}))

const mockAnthropicCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockAnthropicCreate }
  },
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import { classifyImage } from '../../server/modules/ai/ai.service'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeGeminiResponse(isWorkout: boolean, type: string, confidence: number) {
  return {
    response: {
      text: () => JSON.stringify({ isWorkout, type, confidence }),
    },
  }
}

function makeAnthropicResponse(isWorkout: boolean, type: string, confidence: number) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ isWorkout, type, confidence }) }],
  }
}

function mockSuccessfulFetch(contentType = 'image/jpeg') {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: (_name: string) => contentType },
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as Response)
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  process.env.AI_API_KEY = ''
  mockSuccessfulFetch()
})

// ── Gemini provider tests ─────────────────────────────────────────────────────

describe('classifyImage — Gemini provider (default)', () => {
  it('returns VERIFIED result for a clear gym photo', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'GYM', 0.88))
    const result = await classifyImage('https://r2.example.com/posts/user/gym.jpg')
    expect(result.isWorkout).toBe(true)
    expect(result.confidence).toBe(0.88)
    expect(result.type).toBe(WorkoutType.GYM)
    expect(result.modelVersion).toContain('gemini')
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('returns REJECTED result for food photo (low confidence)', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(false, 'OTHER', 0.12))
    const result = await classifyImage('https://r2.example.com/posts/user/food.jpg')
    expect(result.isWorkout).toBe(false)
    expect(result.confidence).toBeLessThan(0.50)
  })

  it('returns ambiguous result for borderline image (0.50–0.69)', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(false, 'GYM', 0.58))
    const result = await classifyImage('https://r2.example.com/posts/user/ambig.jpg')
    expect(result.isWorkout).toBe(false)
    expect(result.confidence).toBeGreaterThanOrEqual(0.50)
    expect(result.confidence).toBeLessThan(0.70)
  })

  it('correctly maps RUNNING type', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'RUNNING', 0.92))
    const result = await classifyImage('https://r2.example.com/posts/user/run.jpg')
    expect(result.type).toBe(WorkoutType.RUNNING)
  })

  it('correctly maps CYCLING type', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'CYCLING', 0.84))
    const result = await classifyImage('https://r2.example.com/posts/user/cycle.jpg')
    expect(result.type).toBe(WorkoutType.CYCLING)
  })

  it('correctly maps SWIMMING type', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'SWIMMING', 0.79))
    const result = await classifyImage('https://r2.example.com/posts/user/swim.jpg')
    expect(result.type).toBe(WorkoutType.SWIMMING)
  })

  it('maps unknown type to OTHER (graceful fallback)', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'BOXING', 0.80))
    const result = await classifyImage('https://r2.example.com/posts/user/box.jpg')
    expect(result.type).toBe(WorkoutType.OTHER)
  })

  it('maps YOGA type to OUTDOOR (Prisma enum alias)', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'YOGA', 0.82))
    const result = await classifyImage('https://r2.example.com/posts/user/yoga.jpg')
    expect(result.type).toBe(WorkoutType.OUTDOOR)
  })

  it('throws if image URL is not accessible (404)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 } as unknown as Response)
    await expect(classifyImage('https://r2.example.com/nonexistent.jpg')).rejects.toThrow(
      'Failed to fetch image from R2'
    )
  })

  it('throws if Gemini API throws', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Gemini API error'))
    await expect(classifyImage('https://r2.example.com/posts/user/img.jpg')).rejects.toThrow(
      'Gemini API error'
    )
  })

  it('throws if GEMINI_API_KEY is missing', async () => {
    process.env.GEMINI_API_KEY = ''
    await expect(classifyImage('https://r2.example.com/img.jpg')).rejects.toThrow('GEMINI_API_KEY')
  })

  it('throws if response contains no JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'I cannot determine this from the image.' },
    })
    await expect(classifyImage('https://r2.example.com/img.jpg')).rejects.toThrow(
      'No JSON found in classification response'
    )
  })

  it('throws if JSON response has wrong shape', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => '{"result": "workout"}' },
    })
    await expect(classifyImage('https://r2.example.com/img.jpg')).rejects.toThrow(
      'Invalid classification response shape'
    )
  })

  it('returns confidence rounded to 4 decimal places', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'GYM', 0.833333333))
    const result = await classifyImage('https://r2.example.com/posts/user/gym.jpg')
    const str = result.confidence.toString()
    const decimals = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimals).toBeLessThanOrEqual(4)
  })

  it('clamps confidence above 1.0 to 1.0', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'GYM', 1.5))
    const result = await classifyImage('https://r2.example.com/posts/user/gym.jpg')
    expect(result.confidence).toBeLessThanOrEqual(1.0)
  })

  it('clamps confidence below 0.0 to 0.0', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(false, 'OTHER', -0.2))
    const result = await classifyImage('https://r2.example.com/posts/user/img.jpg')
    expect(result.confidence).toBeGreaterThanOrEqual(0.0)
  })

  it('handles png content-type correctly', async () => {
    mockSuccessfulFetch('image/png')
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'GYM', 0.75))
    const result = await classifyImage('https://r2.example.com/posts/user/gym.png')
    expect(result.isWorkout).toBe(true)
  })

  it('defaults to image/jpeg for unknown content-type', async () => {
    mockSuccessfulFetch('application/octet-stream')
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'GYM', 0.80))
    const result = await classifyImage('https://r2.example.com/posts/user/gym.jpg')
    expect(result.isWorkout).toBe(true)
  })

  it('threshold boundary: exactly 0.70 is VERIFIED-eligible', async () => {
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'GYM', 0.70))
    const result = await classifyImage('https://r2.example.com/posts/user/gym.jpg')
    expect(result.confidence).toBe(0.70)
    expect(result.isWorkout).toBe(true)
  })
})

// ── Claude provider tests ─────────────────────────────────────────────────────

describe('classifyImage — Claude provider (AI_PROVIDER=claude)', () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = 'claude'
    process.env.AI_API_KEY = 'sk-ant-test-key'
    process.env.GEMINI_API_KEY = ''
  })

  it('uses Claude when AI_PROVIDER=claude', async () => {
    mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(true, 'GYM', 0.85))
    const result = await classifyImage('https://r2.example.com/posts/user/gym.jpg')
    expect(result.isWorkout).toBe(true)
    expect(result.modelVersion).toContain('claude-haiku')
    expect(mockAnthropicCreate).toHaveBeenCalledOnce()
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  it('throws if AI_API_KEY is missing when using claude provider', async () => {
    process.env.AI_API_KEY = ''
    await expect(classifyImage('https://r2.example.com/img.jpg')).rejects.toThrow('AI_API_KEY')
  })
})

// ── Provider selection tests ──────────────────────────────────────────────────

describe('provider selection', () => {
  it('defaults to gemini when AI_PROVIDER is not set', async () => {
    delete process.env.AI_PROVIDER
    process.env.GEMINI_API_KEY = 'test-key'
    mockGenerateContent.mockResolvedValue(makeGeminiResponse(true, 'GYM', 0.85))
    const result = await classifyImage('https://r2.example.com/posts/user/gym.jpg')
    expect(result.modelVersion).toContain('gemini')
  })

  it('throws for unknown AI_PROVIDER value', async () => {
    process.env.AI_PROVIDER = 'hf-inference'
    await expect(classifyImage('https://r2.example.com/img.jpg')).rejects.toThrow(
      'Unknown AI_PROVIDER'
    )
  })
})
