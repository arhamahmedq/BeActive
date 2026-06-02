/**
 * qa-day-increment.mjs — Proves streak increments from 1 → 2 across a local day boundary.
 *
 * Strategy (timezone trick):
 *   Pacific/Guadalcanal (UTC+11, Solomon Islands — no DST, always exact UTC+11).
 *   At script start it is 23:xx local. Midnight (UTC 13:00:00) is ≤60 minutes away.
 *
 *   Workout 1: uploaded now → DailyCompletion.localDate = "YYYY-MM-DD" (today in UTC+11)
 *   Script waits until UTC 13:00:00 (midnight in UTC+11).
 *   Workout 2: uploaded after midnight → localDate = next day in UTC+11.
 *   recomputeStreak([day, day+1]) → currentStreak = 2.
 *
 * Invariants:
 *   - No direct DB edits to streak state.
 *   - All streak changes happen through the application API only.
 *   - User creation uses Prisma (unavoidable — signup requires email confirmation).
 *   - Cleanup deletes the throwaway account on exit.
 *
 * Usage:
 *   node --env-file=app/web/.env.local qa-day-increment.mjs
 *
 * Requirements:
 *   - Dev server running on localhost:3000
 *   - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY in env
 */

import { createClient } from '/Users/arhamahmedfiroz/Documents/Projects/BeActive/node_modules/@supabase/supabase-js/dist/index.mjs'
import { PrismaClient } from '/Users/arhamahmedfiroz/Documents/Projects/BeActive/node_modules/@prisma/client/default.js'

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

const TARGET_TZ = 'Pacific/Guadalcanal' // UTC+11, no DST — currently 23:xx, midnight in ~60 min
// UTC midnight in TARGET_TZ = UTC 13:00:00
const MIDNIGHT_UTC_HOUR = 13

// Known-good workout image from R2 — passed Gemini classification in prior QA sessions
const TEST_IMAGE_URL = 'https://pub-5ede6487e8dc42228479e7518bad48f1.r2.dev/posts/6b46995c-fa3f-4f81-b609-7a426374fe81/fc427768-0bef-4d01-8c67-7d1c4e7b713f.jpg'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  process.exit(1)
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const prisma = new PrismaClient()

const RUN_ID = Date.now()
const TEST_EMAIL = `qa-dayinc-${RUN_ID}@beactive.test`
const TEST_PASSWORD = 'QATestPass123!'
const TEST_USERNAME = `qadayinc${RUN_ID}`

let sessionCookies = ''
let userId = ''

// ─── Helpers ─────────────────────────────────────────────────────────────────

function localStr(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(new Date())
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`)
}

async function api(method, path, body, extra = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookies, ...extra },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const setCookie = res.headers.getSetCookie?.() ?? []
  if (setCookie.length > 0) {
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
  let json = null
  try { json = JSON.parse(text) } catch { /* ok */ }
  return { status: res.status, json, text }
}

async function getStreak() {
  const { status, json } = await api('GET', '/api/streaks/me')
  assert(status === 200, `GET /api/streaks/me returned ${status}: ${JSON.stringify(json)}`)
  return json.streak
}

async function downloadImage() {
  console.log(`    Downloading test image from R2…`)
  const res = await fetch(TEST_IMAGE_URL, { signal: AbortSignal.timeout(20_000) })
  assert(res.ok, `Image download failed: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`    Downloaded ${(buf.byteLength / 1024).toFixed(1)} KB`)
  return buf
}

async function uploadWorkout(imageBuffer, label) {
  console.log(`\n  → Uploading workout: ${label}`)
  const signRes = await api('POST', '/api/uploads/sign', { mimeType: 'image/jpeg', fileSize: imageBuffer.byteLength })
  assert(signRes.status === 200, `Sign failed: ${signRes.status} ${JSON.stringify(signRes.json)}`)
  const { uploadUrl, key } = signRes.json

  const r2Res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: imageBuffer })
  assert(r2Res.ok, `R2 upload failed: HTTP ${r2Res.status}`)
  console.log(`    Uploaded to R2: ${key}`)

  const createRes = await api('POST', '/api/posts/create', { imageKey: key, caption: `QA day-increment — ${label}` })
  if (createRes.status === 409) {
    console.log(`    POST /api/posts/create → 409 CONFLICT (same-day guard fired)`)
    return { status: 409, postId: null }
  }
  assert(createRes.status === 201, `Post create failed: ${createRes.status} ${JSON.stringify(createRes.json)}`)
  const postId = createRes.json.post.id
  console.log(`    Post created: ${postId}`)
  console.log(`    Local time in ${TARGET_TZ}: ${localStr(TARGET_TZ)}`)
  return { status: 201, postId }
}

async function pollClassification(postId, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { status, json } = await api('GET', `/api/posts/${postId}`)
    assert(status === 200, `GET /api/posts/${postId} returned ${status}`)
    const s = json.post?.status
    if (s === 'VERIFIED' || s === 'REJECTED') {
      const confidence = json.post?.workout?.aiConfidence
      console.log(`    AI result: ${s}${confidence != null ? ` (confidence: ${confidence})` : ''}`)
      return s
    }
    await new Promise(r => setTimeout(r, 3_000))
    process.stdout.write(`    Polling classification… [${new Date().toISOString()}]\r`)
  }
  throw new Error('Classification timed out after 60s')
}

// ─── Setup ────────────────────────────────────────────────────────────────────

async function setup() {
  console.log('\n════════════════════════════════════════════════')
  console.log('  BeActive — Day-Boundary Increment QA')
  console.log('════════════════════════════════════════════════')
  console.log(`  Target timezone : ${TARGET_TZ} (UTC+11)`)
  console.log(`  Local time now  : ${localStr(TARGET_TZ)}`)
  console.log(`  Midnight at UTC : 13:00:00 (UTC+11 00:00)`)
  console.log(`  Run ID          : ${RUN_ID}`)
  console.log(`  Server          : ${BASE_URL}`)
  console.log('════════════════════════════════════════════════\n')

  // Create pre-confirmed Supabase auth user
  console.log('SETUP — Creating throwaway test user')
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { username: TEST_USERNAME },
  })
  assert(!error, `Supabase createUser failed: ${error?.message}`)
  userId = data.user.id
  console.log(`  Supabase auth user: ${userId}`)

  // Create app DB records (mirrors what the email-confirmation callback does)
  await prisma.user.create({
    data: {
      id: userId,
      email: TEST_EMAIL,
      username: TEST_USERNAME,
      timezone: TARGET_TZ,   // set at "onboarding" — skip the onboarding PATCH call
      onboarded: true,
      streak: { create: { current: 0, best: 0, status: 'INACTIVE' } },
    },
  })
  console.log(`  App DB user + streak created (timezone=${TARGET_TZ})`)

  // Login via API to get session cookies
  const loginRes = await api('POST', '/api/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD })
  assert(loginRes.status === 200, `Login failed: ${loginRes.status} ${JSON.stringify(loginRes.json)}`)
  assert(sessionCookies.length > 0, 'No session cookies after login')
  console.log('  Logged in — session cookies captured')
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\nCLEANUP')
  try {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
    console.log('  Throwaway user deleted from DB and Supabase')
  } catch (e) {
    console.log(`  Warning: cleanup partially failed: ${e.message}`)
  }
  await prisma.$disconnect()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await setup()

  // ── Step 0: Verify initial state ──
  console.log('\nSTEP 0 — Verify initial state')
  const s0 = await getStreak()
  assert(s0.status === 'INACTIVE', `Expected INACTIVE, got ${s0.status}`)
  assert(s0.current === 0, `Expected current=0, got ${s0.current}`)
  assert(s0.completedToday === false, `Expected completedToday=false, got ${s0.completedToday}`)
  console.log(`  ✓ status=INACTIVE current=0 best=0`)

  // ── Step 1: Download image once, reuse for both uploads ──
  console.log('\nSTEP 1 — Download test image')
  const imageBuffer = await downloadImage()

  // ── Step 2: Workout 1 (before midnight in UTC+11) ──
  console.log('\nSTEP 2 — Workout 1 (Day 1 in UTC+11: ' + localStr(TARGET_TZ).slice(0, 10) + ')')
  const w1 = await uploadWorkout(imageBuffer, 'Day 1')
  assert(w1.status === 201, `Expected 201, got ${w1.status}`)

  const w1Class = await pollClassification(w1.postId)
  if (w1Class !== 'VERIFIED') {
    console.log(`\n  ⚠ ABORTED — Workout 1 was ${w1Class}. Test image no longer passes classification.`)
    console.log('  Cannot prove day-boundary increment without a VERIFIED workout.')
    await cleanup()
    process.exit(1)
  }

  const s1 = await getStreak()
  assert(s1.status === 'ACTIVE', `Expected ACTIVE after workout 1, got ${s1.status}`)
  assert(s1.current === 1, `Expected current=1, got ${s1.current}`)
  assert(s1.best === 1, `Expected best=1, got ${s1.best}`)
  assert(s1.completedToday === true, `Expected completedToday=true, got ${s1.completedToday}`)
  console.log(`\n  ✓ After workout 1: status=${s1.status} current=${s1.current} best=${s1.best} completedToday=${s1.completedToday}`)
  console.log(`  ✓ lastVerifiedDate=${s1.lastVerifiedDate} (${TARGET_TZ})`)

  // ── Step 3: Confirm same-day guard works ──
  console.log('\nSTEP 3 — Confirm same-day duplicate is blocked (409)')
  const dup = await uploadWorkout(imageBuffer, 'Duplicate same day')
  assert(dup.status === 409, `Expected 409 for same-day duplicate, got ${dup.status}`)
  const s1b = await getStreak()
  assert(s1b.current === 1, `Streak must not change after 409, got ${s1b.current}`)
  console.log(`  ✓ 409 returned — same-day guard active. Streak unchanged at 1.`)

  // ── Step 4: Wait for midnight in UTC+11 (UTC 13:00:00) ──
  console.log('\nSTEP 4 — Waiting for midnight in ' + TARGET_TZ)
  const now = new Date()
  const targetMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), MIDNIGHT_UTC_HOUR, 0, 5))
  // If we're already past UTC 13:00 today, target tomorrow's UTC 13:00
  if (targetMidnight <= now) {
    targetMidnight.setUTCDate(targetMidnight.getUTCDate() + 1)
  }
  const waitMs = targetMidnight.getTime() - Date.now()
  const waitMin = (waitMs / 60000).toFixed(1)
  console.log(`  Local time now   : ${localStr(TARGET_TZ)}`)
  console.log(`  Midnight at UTC  : ${targetMidnight.toISOString()}`)
  console.log(`  Waiting          : ${waitMin} minutes`)

  // Count down with periodic updates
  const interval = setInterval(() => {
    const remaining = ((targetMidnight.getTime() - Date.now()) / 60000).toFixed(1)
    process.stdout.write(`  Remaining: ${remaining} min — local: ${localStr(TARGET_TZ)}\r`)
  }, 10_000)

  await new Promise(resolve => setTimeout(resolve, waitMs))
  clearInterval(interval)
  process.stdout.write('\n')
  console.log(`  Midnight crossed! Local time: ${localStr(TARGET_TZ)}`)

  // Brief buffer to let any in-flight requests settle
  await new Promise(r => setTimeout(r, 2_000))

  // ── Step 5: Workout 2 (after midnight in UTC+11 — new local day) ──
  const day2Date = localStr(TARGET_TZ).slice(0, 10)
  console.log(`\nSTEP 5 — Workout 2 (Day 2 in UTC+11: ${day2Date})`)
  const w2 = await uploadWorkout(imageBuffer, 'Day 2')

  if (w2.status === 409) {
    console.log('\n  ✗ FAIL — POST /api/posts/create returned 409 AFTER midnight.')
    console.log('  The same-day guard fired when it should not have — the local date did not advance.')
    console.log(`  Current local time: ${localStr(TARGET_TZ)}`)
    await cleanup()
    process.exit(1)
  }

  assert(w2.status === 201, `Expected 201 for workout 2, got ${w2.status}`)

  const w2Class = await pollClassification(w2.postId)
  if (w2Class !== 'VERIFIED') {
    console.log(`\n  ⚠ Workout 2 was ${w2Class} — AI non-determinism. Cannot complete test.`)
    await cleanup()
    process.exit(1)
  }

  const s2 = await getStreak()

  // ── Step 6: Assert the result ──
  console.log('\nSTEP 6 — Assert final streak state')
  console.log(`  status          = ${s2.status}        (expected: ACTIVE)`)
  console.log(`  current         = ${s2.current}           (expected: 2)`)
  console.log(`  best            = ${s2.best}           (expected: 2)`)
  console.log(`  completedToday  = ${s2.completedToday}     (expected: true)`)
  console.log(`  lastVerifiedDate= ${s2.lastVerifiedDate} (expected: ${day2Date})`)
  console.log(`  displayTier     = ${s2.displayTier}`)

  const passed =
    s2.status === 'ACTIVE' &&
    s2.current === 2 &&
    s2.best === 2 &&
    s2.completedToday === true &&
    s2.lastVerifiedDate === day2Date

  await cleanup()

  console.log('\n════════════════════════════════════════════════')
  if (passed) {
    console.log('  ✅ PASS — Streak correctly incremented 1 → 2 across the local day boundary.')
    console.log('  The day-boundary increment path works correctly. Proceed to Slice 5/6.')
  } else {
    console.log('  ❌ FAIL — Streak did not increment to 2.')
    console.log(`  status=${s2.status} current=${s2.current} best=${s2.best}`)
    console.log('  Inspect server logs for: "streaks.service: streak updated" on the workout 2 postId.')
  }
  console.log('════════════════════════════════════════════════\n')
  process.exit(passed ? 0 : 1)
}

main().catch(e => {
  console.error('\nFATAL:', e)
  prisma.$disconnect().catch(() => {})
  process.exit(1)
})
