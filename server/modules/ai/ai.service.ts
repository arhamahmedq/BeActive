/**
 * AI Classification Service
 *
 * Provider selection via AI_PROVIDER env var:
 *   "gemini"  (default) — Google Gemini Flash, GEMINI_API_KEY required
 *   "claude"  — Anthropic claude-haiku-4-5, AI_API_KEY required
 *
 * HuggingFace CLIP is no longer supported: @huggingface/inference v4 removed
 * openai/clip-vit-base-patch32 from all inference provider mappings.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
import { WorkoutType } from '@prisma/client'
import type { ClassificationOutput } from './ai.types'

// ── Shared constants ──────────────────────────────────────────────────────────

const IMAGE_FETCH_TIMEOUT_MS = 8_000
const CLASSIFY_TIMEOUT_MS = 15_000

const WORKOUT_TYPE_MAP: Record<string, WorkoutType> = {
  GYM: WorkoutType.GYM,
  RUNNING: WorkoutType.RUNNING,
  CYCLING: WorkoutType.CYCLING,
  SWIMMING: WorkoutType.SWIMMING,
  OUTDOOR: WorkoutType.OUTDOOR,
  YOGA: WorkoutType.OUTDOOR,   // YOGA maps to OUTDOOR in the Prisma enum
  SPORTS: WorkoutType.SPORTS,
  OTHER: WorkoutType.OTHER,
}

const CLASSIFICATION_PROMPT = `You are a fitness image classifier. Analyze the image and return a JSON classification.

Output ONLY the JSON object below. No explanation. No markdown. No extra text.

{
  "isWorkout": <true if the image shows a person actively exercising, false otherwise>,
  "type": <one of: "GYM", "RUNNING", "CYCLING", "SWIMMING", "YOGA", "SPORTS", "OTHER">,
  "confidence": <number between 0.0 and 1.0>
}

Classification rules:
- isWorkout must be true only when a person is visibly and actively exercising
- type must be the single best match, or "OTHER" for valid workouts not in the list
- confidence: 0.70 or above means clearly a workout; 0.50-0.69 means probably a workout; below 0.50 means not a workout
- Non-workout images (food, selfies, objects, landscapes): isWorkout false, confidence below 0.30`

// ── Response parsing ─────────────────────────────────────────────────────────

interface RawClassification {
  isWorkout: boolean
  type: string
  confidence: number
}

function parseClassificationResponse(text: string): RawClassification {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON found in classification response: ${text.slice(0, 200)}`)

  const parsed = JSON.parse(match[0]) as Partial<RawClassification>
  if (
    typeof parsed.isWorkout !== 'boolean' ||
    typeof parsed.type !== 'string' ||
    typeof parsed.confidence !== 'number'
  ) {
    throw new Error(`Invalid classification response shape: ${match[0]}`)
  }
  return {
    isWorkout: parsed.isWorkout,
    type: parsed.type,
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
  }
}

function buildOutput(raw: RawClassification, processingTimeMs: number, modelVersion: string): ClassificationOutput {
  return {
    isWorkout: raw.isWorkout,
    type: WORKOUT_TYPE_MAP[raw.type] ?? WorkoutType.OTHER,
    confidence: Math.round(raw.confidence * 10_000) / 10_000,
    processingTimeMs,
    modelVersion,
  }
}

// ── Image fetching ────────────────────────────────────────────────────────────

type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const SUPPORTED_MIME_TYPES: SupportedMimeType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function resolveMimeType(contentType: string | null): SupportedMimeType {
  const ct = (contentType ?? 'image/jpeg').split(';')[0]?.trim().toLowerCase() ?? 'image/jpeg'
  return SUPPORTED_MIME_TYPES.includes(ct as SupportedMimeType) ? (ct as SupportedMimeType) : 'image/jpeg'
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: SupportedMimeType }> {
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Failed to fetch image from R2: HTTP ${res.status}`)
  const buffer = await res.arrayBuffer()
  return {
    base64: Buffer.from(buffer).toString('base64'),
    mimeType: resolveMimeType(res.headers.get('content-type')),
  }
}

// ── Gemini Vision provider ────────────────────────────────────────────────────

const GEMINI_MODEL_ID = 'gemini-2.5-flash-lite'

async function classifyWithGemini(imageUrl: string): Promise<ClassificationOutput> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey')

  const startMs = Date.now()
  const { base64, mimeType } = await fetchImageAsBase64(imageUrl)

  const genAI = new GoogleGenerativeAI(key)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_ID })

  const result = await model.generateContent(
    [{ inlineData: { data: base64, mimeType } }, CLASSIFICATION_PROMPT],
    { timeout: CLASSIFY_TIMEOUT_MS }
  )

  const responseText = result.response.text()
  const raw = parseClassificationResponse(responseText)
  return buildOutput(raw, Date.now() - startMs, GEMINI_MODEL_ID)
}

// ── Claude Vision provider ────────────────────────────────────────────────────

const CLAUDE_MODEL_ID = 'claude-haiku-4-5-20251001'

async function classifyWithClaude(imageUrl: string): Promise<ClassificationOutput> {
  const key = process.env.AI_API_KEY
  if (!key) throw new Error('AI_API_KEY is not set. Get an Anthropic key at https://console.anthropic.com/settings/keys')

  const startMs = Date.now()
  const { base64, mimeType } = await fetchImageAsBase64(imageUrl)

  const client = new Anthropic({ apiKey: key, timeout: CLASSIFY_TIMEOUT_MS })
  const message = await client.messages.create({
    model: CLAUDE_MODEL_ID,
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: CLASSIFICATION_PROMPT },
      ],
    }],
  })

  const responseText = message.content[0]?.type === 'text' ? message.content[0].text : ''
  const raw = parseClassificationResponse(responseText)
  return buildOutput(raw, Date.now() - startMs, CLAUDE_MODEL_ID)
}

// ── Provider selection (feature flag) ────────────────────────────────────────

function selectProvider(): (imageUrl: string) => Promise<ClassificationOutput> {
  const name = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase()
  switch (name) {
    case 'gemini': return classifyWithGemini
    case 'claude': return classifyWithClaude
    default:
      throw new Error(
        `Unknown AI_PROVIDER="${name}". Supported values: "gemini" (default), "claude". ` +
        'HuggingFace CLIP is no longer supported (HF SDK v4 dropped it from inference provider mapping).'
      )
  }
}

// ── Public interface ──────────────────────────────────────────────────────────

export async function classifyImage(imageUrl: string): Promise<ClassificationOutput> {
  return selectProvider()(imageUrl)
}
