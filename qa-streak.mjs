/**
 * qa-streak.mjs — Streak Engine QA Runner (Tests T1–T7)
 *
 * Usage:
 *   node --env-file=app/web/.env.local qa-streak.mjs
 *
 * What it tests (per TESTING_STRATEGY.md):
 *   T1  Signup + initial state INACTIVE, current=0, best=0
 *   T2  Workout verified → streak increments by exactly 1
 *   T3  Two workouts same day → streak increments only once (409)
 *   T4  Cron at 20h → user AT_RISK (evaluateStreaks via HTTP)
 *   T5  Cron at 24h → streak BROKEN
 *   T6  Post after break → streak restarts at 1, best preserved
 *   T7  best = MAX(best, current) validated across the above sequence
 *
 * Notes:
 *   - Creates a pre-confirmed test user via Supabase admin API (no email needed)
 *   - Cleans up the test user + streak record from DB on completion
 *   - For T2/T6: downloads a test workout image from the web and uploads it
 *   - For T4/T5: directly updates lastVerifiedAt in DB to simulate elapsed time
 */

import { createClient as createSupabaseClient } from '/Users/arhamahmedfiroz/Documents/Projects/BeActive/node_modules/@supabase/supabase-js/dist/index.mjs'
import { PrismaClient } from '/Users/arhamahmedfiroz/Documents/Projects/BeActive/node_modules/@prisma/client/default.js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const CRON_SECRET = process.env.CRON_SECRET

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  process.exit(1)
}
if (!CRON_SECRET) {
  console.error('FATAL: CRON_SECRET must be set')
  process.exit(1)
}

const adminClient = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const prisma = new PrismaClient()

// Test credentials — unique per run
const RUN_ID = Date.now()
const TEST_EMAIL = `qa-streak-${RUN_ID}@beactive.test`
const TEST_PASSWORD = 'QATestPass123!'
const TEST_USERNAME = `qastreak${RUN_ID}`

// QA state threaded through tests
let sessionCookies = ''
let userId = ''
let t2PostId = ''  // tracked so T6 can backdate it to simulate an overnight break

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PASS = '✅ PASS'
const FAIL = '❌ FAIL'

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

async function api(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookies,
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })

  // Capture any Set-Cookie headers to persist the session
  const setCookie = res.headers.getSetCookie?.() ?? []
  if (setCookie.length > 0) {
    // Merge new cookies, deduplicating by name
    const existing = Object.fromEntries(
      sessionCookies.split('; ').filter(Boolean).map(c => [c.split('=')[0], c])
    )
    for (const raw of setCookie) {
      const [pair] = raw.split(';')
      const [name] = pair.split('=')
      existing[name] = pair
    }
    sessionCookies = Object.values(existing).join('; ')
  }

  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  return { status: res.status, json, text }
}

async function getStreak() {
  const { status, json } = await api('GET', '/api/streaks/me')
  if (status === 404) return null
  assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(json)}`)
  return json.streak
}

async function setLastVerifiedAt(hoursAgo) {
  const past = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
  await prisma.streak.update({
    where: { userId },
    data: { lastVerifiedAt: past },
  })
  return past
}

// Backdates a post's createdAt — used to simulate cross-day scenario for T6.
// In production the last verified post is always from a different UTC day when
// the streak breaks overnight; in the QA session T2's post was created minutes
// ago so the same-day guard fires. Backdating the post makes the DB consistent
// with what the application would have naturally produced.
async function backdatePost(postId, hoursAgo) {
  const past = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
  await prisma.post.update({
    where: { id: postId },
    data: { createdAt: past },
  })
  console.log(`  Backdated post ${postId} to ${past.toISOString()} (${hoursAgo}h ago)`)
}

async function triggerCron() {
  const { status, json } = await api('GET', '/api/cron/streak-evaluator', null, {
    Authorization: `Bearer ${CRON_SECRET}`,
  })
  assert(status === 200, `Cron returned ${status}: ${JSON.stringify(json)}`)
  return json
}

async function downloadTestImage() {
  // Reuse an existing verified workout image from R2 — guaranteed to pass Gemini classification
  const url = 'https://pub-5ede6487e8dc42228479e7518bad48f1.r2.dev/posts/6b46995c-fa3f-4f81-b609-7a426374fe81/fc427768-0bef-4d01-8c67-7d1c4e7b713f.jpg'
  console.log(`    Fetching test workout image from R2`)
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Failed to download test image: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  console.log(`    Downloaded ${(buf.byteLength / 1024).toFixed(1)} KB`)
  return { buffer: Buffer.from(buf), mimeType: 'image/jpeg' }
}

async function uploadWorkout(imageBuffer, mimeType) {
  // 1. Get presigned URL
  const signRes = await api('POST', '/api/uploads/sign', {
    mimeType,
    fileSize: imageBuffer.byteLength,
  })
  assert(signRes.status === 200, `Sign failed: ${signRes.status} ${JSON.stringify(signRes.json)}`)
  const { uploadUrl, key } = signRes.json
  assert(uploadUrl && key, 'Missing uploadUrl or key from sign response')

  // 2. Upload to R2 via XHR-equivalent (fetch PUT)
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: imageBuffer,
  })
  assert(uploadRes.ok, `R2 upload failed: HTTP ${uploadRes.status}`)
  console.log(`    Uploaded to R2 with key: ${key}`)

  // 3. Create post
  const createRes = await api('POST', '/api/posts/create', {
    imageKey: key,
    caption: 'QA test workout',
  })
  if (createRes.status === 409) return { status: 409, postId: null }
  assert(createRes.status === 201, `Post create failed: ${createRes.status} ${JSON.stringify(createRes.json)}`)
  const postId = createRes.json.post.id
  console.log(`    Post created: ${postId}`)
  return { status: 201, postId }
}

async function pollForClassification(postId, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await api('GET', `/api/posts/${postId}`)
    assert(res.status === 200, `Poll failed: ${res.status}`)
    const status = res.json.post.status
    if (status === 'VERIFIED' || status === 'REJECTED') {
      console.log(`    AI classification: ${status} (type: ${res.json.post.workout?.type ?? 'n/a'}, confidence: ${res.json.post.workout?.aiConfidence ?? 'n/a'})`)
      return status
    }
    await new Promise(r => setTimeout(r, 2000))
    process.stdout.write('    Polling...\r')
  }
  throw new Error('Classification timed out after 45s')
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
async function setup() {
  console.log('\n────────────────────────────────────────')
  console.log('  BeActive Streak Engine QA — Full Reset')
  console.log('────────────────────────────────────────')
  console.log(`  Run ID:  ${RUN_ID}`)
  console.log(`  Email:   ${TEST_EMAIL}`)
  console.log(`  Server:  ${BASE_URL}`)
  console.log('────────────────────────────────────────\n')

  // Create pre-confirmed Supabase auth user (bypasses email confirmation for test automation)
  console.log('SETUP — Creating pre-confirmed test user via admin API')
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { username: TEST_USERNAME },
  })
  if (authError) throw new Error(`Admin createUser failed: ${authError.message}`)
  userId = authData.user.id
  console.log(`  Supabase user created: ${userId}`)

  // Create Prisma User + Streak (mirrors what the email confirmation callback does)
  await prisma.user.create({
    data: {
      id: userId,
      email: TEST_EMAIL,
      username: TEST_USERNAME,
      streak: {
        create: {
          current: 0,
          best: 0,
          status: 'INACTIVE',
        },
      },
    },
  })
  console.log('  Prisma User + Streak records created')

  // Login via API to get session cookies
  const loginRes = await api('POST', '/api/auth/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })
  assert(loginRes.status === 200, `Login failed: ${loginRes.status} ${JSON.stringify(loginRes.json)}`)
  assert(sessionCookies.length > 0, 'No session cookies received after login')
  console.log('  Logged in — session cookies captured')
  console.log()
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
async function cleanup() {
  console.log('\nCLEANUP')
  try {
    // Delete Prisma records (cascade handles streak)
    await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    // Delete Supabase auth user
    await adminClient.auth.admin.deleteUser(userId).catch(() => {})
    console.log('  Test user deleted from DB and Supabase auth')
  } catch (e) {
    console.log(`  Warning: cleanup partially failed: ${e.message}`)
  }
  await prisma.$disconnect()
}

// ---------------------------------------------------------------------------
// T1: Initial state — INACTIVE, current=0, best=0
// ---------------------------------------------------------------------------
async function t1() {
  console.log('T1 — Initial streak state (fresh account)')
  const streak = await getStreak()
  assert(streak !== null, 'Streak record should exist after signup')
  assert(streak.status === 'INACTIVE', `Expected INACTIVE, got ${streak.status}`)
  assert(streak.current === 0, `Expected current=0, got ${streak.current}`)
  assert(streak.best === 0, `Expected best=0, got ${streak.best}`)
  assert(streak.lastVerifiedAt === null, 'Expected lastVerifiedAt=null for new user')
  console.log(`  ${PASS} status=INACTIVE current=0 best=0 lastVerifiedAt=null`)
}

// ---------------------------------------------------------------------------
// T2: Workout verified → streak increments by exactly 1
// ---------------------------------------------------------------------------
let testImage = null
async function t2() {
  console.log('\nT2 — Workout verified → streak increments by exactly 1')
  testImage = await downloadTestImage()

  const { status, postId } = await uploadWorkout(testImage.buffer, testImage.mimeType)
  assert(status === 201, `Expected 201 from posts/create, got ${status}`)
  t2PostId = postId

  const classification = await pollForClassification(postId)
  if (classification !== 'VERIFIED') {
    console.log(`  ⚠️  SKIP — Test image was ${classification} by AI. Re-run with a clearer workout photo.`)
    console.log(`  (This test validates the streak engine, not AI classification — a VERIFIED image is required)`)
    return false
  }

  const streak = await getStreak()
  assert(streak.status === 'ACTIVE', `Expected ACTIVE, got ${streak.status}`)
  assert(streak.current === 1, `Expected current=1, got ${streak.current}`)
  assert(streak.best === 1, `Expected best=1, got ${streak.best}`)
  assert(streak.lastVerifiedAt !== null, 'Expected lastVerifiedAt to be set')
  console.log(`  ${PASS} status=ACTIVE current=1 best=1 lastVerifiedAt=${streak.lastVerifiedAt}`)
  return true
}

// ---------------------------------------------------------------------------
// T3: Two workouts same day → streak increments only once (409)
// ---------------------------------------------------------------------------
async function t3() {
  console.log('\nT3 — Second upload same day → blocked (409 → "already_done" UI)')
  // Sign a new upload URL (the sign endpoint has no same-day guard — it's stateless)
  const signRes = await api('POST', '/api/uploads/sign', {
    mimeType: testImage.mimeType,
    fileSize: testImage.buffer.byteLength,
  })
  assert(signRes.status === 200, `Sign failed: ${signRes.status}`)
  const { uploadUrl, key } = signRes.json

  // Upload the image to R2 (succeeds — the guard is at post creation, not upload)
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': testImage.mimeType },
    body: testImage.buffer,
  })
  assert(uploadRes.ok, `R2 upload failed: ${uploadRes.status}`)

  // Post creation should be blocked
  const createRes = await api('POST', '/api/posts/create', { imageKey: key })
  assert(createRes.status === 409, `Expected 409, got ${createRes.status}: ${JSON.stringify(createRes.json)}`)
  assert(createRes.json.error.code === 'CONFLICT', `Expected CONFLICT code, got ${createRes.json.error.code}`)

  // Streak must not change
  const streak = await getStreak()
  assert(streak.current === 1, `Streak must not increment on duplicate — expected 1, got ${streak.current}`)
  console.log(`  ${PASS} posts/create returned 409 CONFLICT — streak unchanged at 1`)
}

// ---------------------------------------------------------------------------
// T4: Cron at 20h → user AT_RISK
// ---------------------------------------------------------------------------
async function t4() {
  console.log('\nT4 — Cron at 20h → user AT_RISK')
  await setLastVerifiedAt(21) // 21 hours ago → past the 20h threshold
  console.log('  Set lastVerifiedAt to 21h ago')

  const cronResult = await triggerCron()
  assert(cronResult.ok, 'Cron did not return ok:true')
  assert(cronResult.atRisk >= 1, `Expected >=1 AT_RISK user, got ${cronResult.atRisk}`)
  console.log(`  Cron result: atRisk=${cronResult.atRisk} broken=${cronResult.broken}`)

  // Verify user's activityState is now AT_RISK in the DB
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { activityState: true },
  })
  assert(dbUser.activityState === 'AT_RISK', `Expected AT_RISK, got ${dbUser.activityState}`)

  // Streak status itself stays ACTIVE (only user.activityState changes to AT_RISK)
  const streak = await getStreak()
  assert(streak.status === 'ACTIVE', `Streak status should still be ACTIVE, got ${streak.status}`)
  assert(streak.current === 1, `Streak count should be unchanged at 1, got ${streak.current}`)
  console.log(`  ${PASS} user.activityState=AT_RISK, streak.status=ACTIVE, current=1`)
}

// ---------------------------------------------------------------------------
// T5: Cron at 24h → streak BROKEN
// ---------------------------------------------------------------------------
async function t5() {
  console.log('\nT5 — Cron at 24h → streak BROKEN')
  await setLastVerifiedAt(25) // 25 hours ago → past the 24h threshold
  console.log('  Set lastVerifiedAt to 25h ago')

  const cronResult = await triggerCron()
  assert(cronResult.ok, 'Cron did not return ok:true')
  assert(cronResult.broken >= 1, `Expected >=1 broken streak, got ${cronResult.broken}`)
  console.log(`  Cron result: atRisk=${cronResult.atRisk} broken=${cronResult.broken}`)

  // Streak should now be BROKEN
  const streak = await getStreak()
  assert(streak.status === 'BROKEN', `Expected BROKEN, got ${streak.status}`)
  assert(streak.current === 1, `Current should still be 1 (BROKEN preserves count), got ${streak.current}`)

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { activityState: true },
  })
  assert(dbUser.activityState === 'BROKEN', `Expected user BROKEN, got ${dbUser.activityState}`)
  console.log(`  ${PASS} streak.status=BROKEN, user.activityState=BROKEN, current preserved=1`)
}

// ---------------------------------------------------------------------------
// T6: Post after break → streak restarts at 1, best preserved
// ---------------------------------------------------------------------------
async function t6() {
  console.log('\nT6 — Recovery after BROKEN → streak restarts at 1, best preserved')
  // Backdate T2's post to simulate overnight gap: in production a streak only
  // breaks because 24h passed since the LAST post, meaning that post was on a
  // previous UTC day. T2's post was created minutes ago, so same-day guard would
  // fire without this. Backdating makes the DB state match real-world conditions.
  if (t2PostId) await backdatePost(t2PostId, 26)
  const beforeStreak = await getStreak()
  const previousBest = beforeStreak.best
  console.log(`  Pre-recovery: status=${beforeStreak.status} current=${beforeStreak.current} best=${previousBest}`)

  const { status, postId } = await uploadWorkout(testImage.buffer, testImage.mimeType)
  assert(status === 201, `Expected 201 from posts/create, got ${status}`)

  const classification = await pollForClassification(postId)
  if (classification !== 'VERIFIED') {
    console.log(`  ⚠️  SKIP — Recovery workout was ${classification}. Cannot validate T6.`)
    return false
  }

  const streak = await getStreak()
  assert(streak.status === 'ACTIVE', `Expected ACTIVE after recovery, got ${streak.status}`)
  assert(streak.current === 1, `Expected current=1 after reset, got ${streak.current}`)
  assert(streak.best === previousBest, `Expected best=${previousBest} preserved, got ${streak.best}`)
  console.log(`  ${PASS} status=ACTIVE current=1 best=${streak.best} (preserved from before break)`)
  return true
}

// ---------------------------------------------------------------------------
// T7: best = MAX(best, current) — validated across sequence
// ---------------------------------------------------------------------------
async function t7() {
  console.log('\nT7 — best = MAX(best, current) validated across test sequence')
  const streak = await getStreak()
  // Current session: we started at 0, went to 1, broke, recovered to 1.
  // best should remain >= 1 at all points.
  assert(streak.best >= streak.current, `best (${streak.best}) must always be >= current (${streak.current})`)
  assert(streak.best >= 1, `best should be at least 1 after the test sequence, got ${streak.best}`)
  console.log(`  ${PASS} best=${streak.best} >= current=${streak.current} throughout sequence`)
}

// ---------------------------------------------------------------------------
// T4 idempotency bonus: AT_RISK should not re-fire if user already AT_RISK
// ---------------------------------------------------------------------------
async function t4b() {
  console.log('\nT4b — AT_RISK evaluator is idempotent (no double-fire)')
  // Reset state: fresh active streak at 21h ago to get to AT_RISK
  // (T6 already ran a new workout so the user is active again — set back to 21h for test)
  await prisma.streak.update({ where: { userId }, data: { status: 'ACTIVE' } })
  await prisma.user.update({ where: { id: userId }, data: { activityState: 'AT_RISK' } })
  await setLastVerifiedAt(21)

  const cronResult = await triggerCron()
  // User was already AT_RISK — evaluator should NOT re-emit AT_RISK
  assert(cronResult.atRisk === 0, `AT_RISK should not re-fire when user already AT_RISK — got ${cronResult.atRisk}`)
  console.log(`  ${PASS} atRisk=0 when user was already AT_RISK (idempotent)`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const results = []
  await setup()

  const run = async (label, fn) => {
    try {
      const ok = await fn()
      results.push({ label, passed: ok !== false, skipped: ok === false })
    } catch (e) {
      results.push({ label, passed: false, error: e.message })
      console.log(`  ${FAIL} ${e.message}`)
    }
  }

  await run('T1  Initial state', t1)
  await run('T2  First workout → streak=1', t2)

  // T3-T7 depend on T2 having produced a VERIFIED post
  if (results.find(r => r.label.startsWith('T2'))?.passed) {
    await run('T3  Same-day duplicate → 409', t3)
    await run('T4  20h elapsed → AT_RISK', t4)
    await run('T4b AT_RISK idempotency', t4b)
    await run('T5  24h elapsed → BROKEN', t5)
    await run('T6  Recovery → reset to 1', t6)
    await run('T7  best = MAX(best, current)', t7)
  } else {
    console.log('\n⚠️  T2 did not produce a VERIFIED post — T3-T7 skipped. Use a clearer workout image.\n')
    results.push({ label: 'T3–T7', passed: false, skipped: true })
  }

  await cleanup()

  // Summary
  console.log('\n══════════════════════════════════')
  console.log('  QA RESULTS SUMMARY')
  console.log('══════════════════════════════════')
  const passed = results.filter(r => r.passed && !r.skipped).length
  const skipped = results.filter(r => r.skipped).length
  const failed = results.filter(r => !r.passed && !r.skipped).length

  for (const r of results) {
    if (r.skipped) console.log(`  ⚠️  SKIP  ${r.label}`)
    else if (r.passed) console.log(`  ✅ PASS  ${r.label}`)
    else console.log(`  ❌ FAIL  ${r.label}${r.error ? '  →  ' + r.error : ''}`)
  }

  console.log('──────────────────────────────────')
  console.log(`  Passed: ${passed}  Skipped: ${skipped}  Failed: ${failed}`)
  console.log('══════════════════════════════════\n')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('\nFATAL:', e)
  prisma.$disconnect().catch(() => {})
  process.exit(1)
})
