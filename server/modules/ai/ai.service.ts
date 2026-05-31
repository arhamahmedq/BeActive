import { InferenceClient } from '@huggingface/inference'
import { WorkoutType } from '@prisma/client'
import type { ClassificationOutput, WorkoutLabel, LabeledScore } from './ai.types'

const MODEL_ID = 'openai/clip-vit-base-patch32'
const MODEL_VERSION = 'clip-vit-base-patch32-hf-v1'
const IMAGE_FETCH_TIMEOUT_MS = 8_000
const HF_INFERENCE_TIMEOUT_MS = 15_000

// 6 workout-type labels + 1 non-workout anchor.
// workoutConfidence = sum(all workout scores) = 1 - nonWorkoutScore.
// CLIP softmax ensures all scores sum to 1.0.
const WORKOUT_LABELS: WorkoutLabel[] = [
  { text: 'person doing gym workout with weights or machines', type: WorkoutType.GYM },
  { text: 'person running or jogging outdoors or on treadmill', type: WorkoutType.RUNNING },
  { text: 'person cycling or riding a bicycle', type: WorkoutType.CYCLING },
  { text: 'person swimming in pool or open water', type: WorkoutType.SWIMMING },
  { text: 'person doing yoga pilates or stretching exercise', type: WorkoutType.OUTDOOR },
  { text: 'person playing team sports like basketball football or tennis', type: WorkoutType.SPORTS },
]
const NON_WORKOUT_LABEL: WorkoutLabel = {
  text: 'photo of food nature objects scenery or everyday life not exercise',
  type: null,
}
const ALL_LABELS: WorkoutLabel[] = [...WORKOUT_LABELS, NON_WORKOUT_LABEL]

function getHFClient(): InferenceClient {
  const key = process.env.HF_API_KEY
  if (!key) throw new Error('HF_API_KEY environment variable is not set')
  return new InferenceClient(key)
}

function mapToWorkoutType(results: LabeledScore[]): WorkoutType {
  const workoutLabelTexts = new Set(WORKOUT_LABELS.map((l) => l.text))
  const topWorkoutResult = results
    .filter((r) => workoutLabelTexts.has(r.label))
    .sort((a, b) => b.score - a.score)[0]

  if (!topWorkoutResult) return WorkoutType.OTHER

  const matched = WORKOUT_LABELS.find((l) => l.text === topWorkoutResult.label)
  return matched?.type ?? WorkoutType.OTHER
}

export async function classifyImage(imageUrl: string): Promise<ClassificationOutput> {
  const startMs = Date.now()

  const imgResponse = await fetch(imageUrl, {
    signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
  })
  if (!imgResponse.ok) {
    throw new Error(`Failed to fetch image from R2: HTTP ${imgResponse.status}`)
  }
  const imageBlob = await imgResponse.blob()

  const hf = getHFClient()
  const rawResults = await hf.zeroShotImageClassification(
    {
      model: MODEL_ID,
      inputs: { image: imageBlob },
      parameters: { candidate_labels: ALL_LABELS.map((l) => l.text) },
    },
    { signal: AbortSignal.timeout(HF_INFERENCE_TIMEOUT_MS) }
  )

  const results: LabeledScore[] = rawResults as LabeledScore[]

  const workoutLabelTexts = new Set(WORKOUT_LABELS.map((l) => l.text))
  const workoutScore = results
    .filter((r) => workoutLabelTexts.has(r.label))
    .reduce((sum, r) => sum + r.score, 0)

  const workoutType = mapToWorkoutType(results)

  return {
    isWorkout: workoutScore >= 0.70,
    type: workoutType,
    confidence: Math.round(workoutScore * 10_000) / 10_000, // 4 decimal precision
    processingTimeMs: Date.now() - startMs,
    modelVersion: MODEL_VERSION,
  }
}
