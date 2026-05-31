import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkoutType } from '@prisma/client'

// Shared mock function — must be declared before vi.mock factory runs
const mockZeroShot = vi.fn()

// Mock HuggingFace SDK — class syntax is required (arrow fns aren't constructors)
vi.mock('@huggingface/inference', () => ({
  InferenceClient: class {
    zeroShotImageClassification = mockZeroShot
  },
}))

// Mock global fetch for image retrieval
const mockFetch = vi.fn()
global.fetch = mockFetch

import { classifyImage } from '../../server/modules/ai/ai.service'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HF_API_KEY = 'hf_test_token'

  // Default: image fetch succeeds
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    blob: async () => new Blob(['fake-image-data'], { type: 'image/jpeg' }),
  } as any)
})

// ---------------------------------------------------------------------------
// Simulate classification scores for a clear gym photo
// ---------------------------------------------------------------------------
function makeGymPhotoScores() {
  return [
    { label: 'person doing gym workout with weights or machines', score: 0.65 },
    { label: 'person running or jogging outdoors or on treadmill', score: 0.03 },
    { label: 'person cycling or riding a bicycle', score: 0.01 },
    { label: 'person swimming in pool or open water', score: 0.01 },
    { label: 'person doing yoga pilates or stretching exercise', score: 0.01 },
    { label: 'person playing team sports like basketball football or tennis', score: 0.02 },
    { label: 'photo of food nature objects scenery or everyday life not exercise', score: 0.27 },
  ]
}

function makeFoodPhotoScores() {
  return [
    { label: 'person doing gym workout with weights or machines', score: 0.04 },
    { label: 'person running or jogging outdoors or on treadmill', score: 0.02 },
    { label: 'person cycling or riding a bicycle', score: 0.01 },
    { label: 'person swimming in pool or open water', score: 0.01 },
    { label: 'person doing yoga pilates or stretching exercise', score: 0.02 },
    { label: 'person playing team sports like basketball football or tennis', score: 0.01 },
    { label: 'photo of food nature objects scenery or everyday life not exercise', score: 0.89 },
  ]
}

function makeAmbiguousScores() {
  return [
    { label: 'person doing gym workout with weights or machines', score: 0.40 },
    { label: 'person running or jogging outdoors or on treadmill', score: 0.10 },
    { label: 'person cycling or riding a bicycle', score: 0.05 },
    { label: 'person swimming in pool or open water', score: 0.01 },
    { label: 'person doing yoga pilates or stretching exercise', score: 0.02 },
    { label: 'person playing team sports like basketball football or tennis', score: 0.02 },
    { label: 'photo of food nature objects scenery or everyday life not exercise', score: 0.40 },
  ]
}

// ---------------------------------------------------------------------------
describe('classifyImage', () => {
  it('returns VERIFIED result for clear gym photo', async () => {
    mockZeroShot.mockResolvedValue(makeGymPhotoScores())
    const result = await classifyImage('https://r2.example.com/posts/user/abc.jpg')
    expect(result.isWorkout).toBe(true)
    expect(result.confidence).toBeGreaterThanOrEqual(0.70)
    expect(result.type).toBe(WorkoutType.GYM)
    expect(result.modelVersion).toContain('clip-vit-base-patch32')
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('returns REJECTED result for food photo', async () => {
    mockZeroShot.mockResolvedValue(makeFoodPhotoScores())
    const result = await classifyImage('https://r2.example.com/posts/user/food.jpg')
    expect(result.isWorkout).toBe(false)
    expect(result.confidence).toBeLessThan(0.50)
  })

  it('returns ambiguous result (not VERIFIED) for borderline image', async () => {
    mockZeroShot.mockResolvedValue(makeAmbiguousScores())
    const result = await classifyImage('https://r2.example.com/posts/user/ambig.jpg')
    expect(result.isWorkout).toBe(false) // below 0.70
    expect(result.confidence).toBeGreaterThanOrEqual(0.50)
    expect(result.confidence).toBeLessThan(0.70)
  })

  it('correctly maps running label to RUNNING workout type', async () => {
    const scores = makeFoodPhotoScores()
    scores[1].score = 0.75 // running label dominant
    scores[6].score = 0.12 // non-workout low
    // Recalculate to ensure workout sum dominates
    mockZeroShot.mockResolvedValue(scores)
    const result = await classifyImage('https://r2.example.com/posts/user/run.jpg')
    // Running label is highest workout label
    expect(result.type).toBe(WorkoutType.RUNNING)
  })

  it('throws if image URL is not accessible', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 } as any)
    await expect(classifyImage('https://r2.example.com/nonexistent.jpg')).rejects.toThrow(
      'Failed to fetch image from R2'
    )
  })

  it('throws if HF API throws', async () => {
    mockZeroShot.mockRejectedValue(new Error('HF API error'))
    await expect(classifyImage('https://r2.example.com/posts/user/img.jpg')).rejects.toThrow(
      'HF API error'
    )
  })

  it('throws if HF_API_KEY is missing', async () => {
    process.env.HF_API_KEY = ''
    await expect(classifyImage('https://r2.example.com/img.jpg')).rejects.toThrow(
      'HF_API_KEY'
    )
  })

  it('returns confidence rounded to 4 decimal places', async () => {
    const scores = makeGymPhotoScores()
    // gym score 0.65 + running 0.03 + cycling 0.01 + swim 0.01 + yoga 0.01 + sports 0.02 = 0.73
    mockZeroShot.mockResolvedValue(scores)
    const result = await classifyImage('https://r2.example.com/posts/user/gym.jpg')
    const str = result.confidence.toString()
    const decimals = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimals).toBeLessThanOrEqual(4)
  })
})
