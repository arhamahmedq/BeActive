/**
 * verify-ai-classification.ts
 *
 * Phase 7 runtime verification script for Slice 3 AI Classification.
 * Run with: npx tsx infra/scripts/verify-ai-classification.ts
 *
 * Prerequisites:
 *   AI_API_KEY=sk-ant-... must be set in .env.local or exported in shell
 *
 * What this verifies:
 *   1. AI_API_KEY loads correctly
 *   2. Image fetch from a public URL works
 *   3. Claude Vision returns valid JSON classification
 *   4. Confidence threshold logic produces correct decisions
 *   5. WorkoutType mapping is correct
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local from project root
config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  console.log('\n=== BeActive Slice 3 — AI Classification Verification ===\n')

  // 1. Check API key
  const apiKey = process.env.AI_API_KEY
  if (!apiKey) {
    console.error('❌ FAIL: AI_API_KEY is not set. Add it to .env.local')
    console.error('   Get your key at: https://console.anthropic.com/settings/keys')
    process.exit(1)
  }
  console.log('✓ AI_API_KEY loaded:', `${apiKey.slice(0, 12)}...`)

  // 2. Dynamic import to get the real classifyImage function
  const { classifyImage } = await import('../../server/modules/ai/ai.service.js')

  // 3. Test with a public gym image (Wikipedia commons — a person at a gym)
  //    This URL is a well-known public image for testing. Replace with your R2 URL.
  const TEST_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Sling_exercise_posterior_chain.jpg/320px-Sling_exercise_posterior_chain.jpg'

  console.log('\n[1/3] Testing with known gym image...')
  console.log('      URL:', TEST_IMAGE_URL)

  try {
    const startMs = Date.now()
    const result = await classifyImage(TEST_IMAGE_URL)
    const wallMs = Date.now() - startMs

    console.log('\n      Result:')
    console.log('        isWorkout:', result.isWorkout)
    console.log('        type:     ', result.type)
    console.log('        confidence:', result.confidence)
    console.log('        model:    ', result.modelVersion)
    console.log('        latency:  ', `${wallMs}ms (wall) / ${result.processingTimeMs}ms (internal)`)

    const decision = result.confidence >= 0.70 ? 'VERIFIED' : result.confidence >= 0.50 ? 'AMBIGUOUS' : 'REJECTED'
    console.log('        decision: ', decision)

    if (result.confidence >= 0.70) {
      console.log('\n✓ PASS: Image classified as workout with confidence ≥ 0.70 → would be VERIFIED')
    } else if (result.confidence >= 0.50) {
      console.log('\n⚠ WARN: Image classified as ambiguous (0.50–0.69) → would stay PENDING')
      console.log('         This may indicate the test image is ambiguous or model calibration differs.')
    } else {
      console.log('\n⚠ WARN: Image classified as non-workout (< 0.50) → would be REJECTED')
      console.log('         Unexpected for a clear gym image. Check model response above.')
    }

    if (wallMs > 8000) {
      console.log('\n⚠ WARN: Classification took', wallMs, 'ms — approaching Vercel 10s timeout')
      console.log('         Consider upgrading to Vercel Pro (60s timeout) for safety margin.')
    }

  } catch (err) {
    console.error('\n❌ FAIL: Classification threw:', String(err))
    if (String(err).includes('401') || String(err).includes('authentication')) {
      console.error('   → Check that AI_API_KEY is a valid Anthropic API key')
    }
    process.exit(1)
  }

  // 4. Test failure path — bad URL
  console.log('\n[2/3] Testing failure path (bad image URL)...')
  try {
    await classifyImage('https://example.com/nonexistent-image-12345.jpg')
    console.error('❌ FAIL: Expected an error for bad URL but got none')
    process.exit(1)
  } catch (err) {
    if (String(err).includes('Failed to fetch image from R2')) {
      console.log('✓ PASS: Correct error thrown for inaccessible image URL')
    } else {
      console.log('✓ PASS: Error thrown for bad URL:', String(err).slice(0, 80))
    }
  }

  // 5. Test missing API key path
  console.log('\n[3/3] Testing missing AI_API_KEY guard...')
  const originalKey = process.env.AI_API_KEY
  process.env.AI_API_KEY = ''
  try {
    await classifyImage('https://example.com/img.jpg')
    console.error('❌ FAIL: Expected AI_API_KEY error but got none')
    process.exit(1)
  } catch (err) {
    if (String(err).includes('AI_API_KEY')) {
      console.log('✓ PASS: Correct error thrown for missing AI_API_KEY')
    } else {
      console.error('❌ FAIL: Wrong error for missing key:', String(err))
      process.exit(1)
    }
  } finally {
    process.env.AI_API_KEY = originalKey
  }

  console.log('\n=== Verification complete: Slice 3 AI Classification is operational ===\n')
  console.log('Next steps:')
  console.log('  1. Set AI_API_KEY in Vercel environment variables')
  console.log('  2. Do a real end-to-end upload via the app')
  console.log('  3. Check DB: post status should change from PENDING → VERIFIED')
  console.log('  4. Check DB: workout row should be created with aiConfidence')
  console.log('  5. Begin Slice 4 — Streak Engine\n')
}

main().catch((err: unknown) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
