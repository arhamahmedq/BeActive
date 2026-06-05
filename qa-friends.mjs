/**
 * qa-friends.mjs — Slice 6 Friends happy-path smoke test (two real users, live server, real DB)
 *
 * Usage:
 *   node --env-file=app/web/.env.local qa-friends.mjs
 *   (dev server must be running: npm run dev)
 *
 * Drives the real HTTP API end-to-end with two authenticated users (A, B):
 *   search → request → pending → accept → list → remove → cancel → block → unblock,
 *   plus self-op guards. Creates two pre-confirmed throwaway users and cleans up.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  process.exit(1)
}

const adminClient = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const prisma = new PrismaClient()

const RUN = Date.now()
const PASSWORD = 'QATestPass123!'
const A = { email: `qa-frnd-a-${RUN}@beactive.test`, username: `qafrndsa${RUN}`, jar: { cookies: '' }, id: '' }
const B = { email: `qa-frnd-b-${RUN}@beactive.test`, username: `qafrndsb${RUN}`, jar: { cookies: '' }, id: '' }

let pass = 0, fail = 0
function check(cond, msg) {
  if (cond) { pass++; console.log(`  ✅ ${msg}`) }
  else { fail++; console.log(`  ❌ ${msg}`) }
}

async function api(jar, method, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: jar.cookies, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const setCookie = res.headers.getSetCookie?.() ?? []
  if (setCookie.length > 0) {
    const existing = Object.fromEntries(jar.cookies.split('; ').filter(Boolean).map(c => [c.split('=')[0], c]))
    for (const raw of setCookie) {
      const [pair] = raw.split(';')
      existing[pair.split('=')[0]] = pair
    }
    jar.cookies = Object.values(existing).join('; ')
  }
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = null }
  return { status: res.status, json }
}

async function createUser(u) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: u.email, password: PASSWORD, email_confirm: true, user_metadata: { username: u.username },
  })
  if (error) throw new Error(`createUser(${u.email}): ${error.message}`)
  u.id = data.user.id
  await prisma.user.create({
    data: { id: u.id, email: u.email, username: u.username, streak: { create: { current: 0, best: 0, status: 'INACTIVE' } } },
  })
  const login = await api(u.jar, 'POST', '/api/auth/login', { email: u.email, password: PASSWORD })
  if (login.status !== 200 || !u.jar.cookies) throw new Error(`login(${u.email}) failed: ${login.status}`)
}

async function run() {
  console.log(`\n── Friends happy-path smoke · run ${RUN} · ${BASE_URL} ──\n`)
  console.log('SETUP: creating users A & B, logging both in')
  await createUser(A)
  await createUser(B)
  console.log(`  A=${A.id}\n  B=${B.id}\n`)

  console.log('1) A searches for B')
  let r = await api(A.jar, 'GET', `/api/users/search?q=${encodeURIComponent(B.username)}`)
  check(r.status === 200, `search 200 (got ${r.status})`)
  check(!!r.json?.users?.some(u => u.id === B.id), 'B appears in A’s search results')

  console.log('2) A sends a friend request to B')
  r = await api(A.jar, 'POST', '/api/friends/request', { targetUserId: B.id })
  check(r.status === 201, `request 201 (got ${r.status})`)
  check(r.json?.friendship?.status === 'PENDING', 'returned friendship is PENDING')

  console.log('3) B sees the incoming request; A sees it outgoing')
  const bPending = await api(B.jar, 'GET', '/api/friends/pending')
  check(bPending.json?.incoming?.some(e => e.user.id === A.id), 'B incoming contains A')
  const aPending = await api(A.jar, 'GET', '/api/friends/pending')
  const outEntry = aPending.json?.outgoing?.find(e => e.user.id === B.id)
  check(!!outEntry, 'A outgoing contains B')
  const friendshipId = bPending.json?.incoming?.find(e => e.user.id === A.id)?.friendshipId

  console.log('4) duplicate request → 409')
  r = await api(A.jar, 'POST', '/api/friends/request', { targetUserId: B.id })
  check(r.status === 409, `duplicate request 409 (got ${r.status})`)

  console.log('5) B accepts')
  r = await api(B.jar, 'POST', '/api/friends/accept', { friendshipId })
  check(r.status === 200 && r.json?.friendship?.status === 'ACCEPTED', `accept 200 ACCEPTED (got ${r.status})`)

  console.log('6) both list each other; friendshipId present (M2)')
  const aFriends = await api(A.jar, 'GET', '/api/friends')
  const bAsFriend = aFriends.json?.friends?.find(f => f.id === B.id)
  check(!!bAsFriend, 'A’s friends list contains B')
  check(!!bAsFriend?.friendshipId, 'friend entry includes friendshipId')
  const bFriends = await api(B.jar, 'GET', '/api/friends')
  check(!!bFriends.json?.friends?.find(f => f.id === A.id), 'B’s friends list contains A')

  console.log('7) A removes B')
  r = await api(A.jar, 'POST', '/api/friends/remove', { friendshipId: bAsFriend.friendshipId })
  check(r.status === 200, `remove 200 (got ${r.status})`)
  const aFriends2 = await api(A.jar, 'GET', '/api/friends')
  check(!aFriends2.json?.friends?.some(f => f.id === B.id), 'B gone from A’s friends list')

  console.log('8) cancel: A re-requests then cancels (F5)')
  r = await api(A.jar, 'POST', '/api/friends/request', { targetUserId: B.id })
  const cancelId = r.json?.friendship?.id
  r = await api(A.jar, 'POST', '/api/friends/cancel', { friendshipId: cancelId })
  check(r.status === 200, `cancel 200 (got ${r.status})`)
  const bPending2 = await api(B.jar, 'GET', '/api/friends/pending')
  check(!bPending2.json?.incoming?.some(e => e.user.id === A.id), 'cancelled request gone from B incoming')

  console.log('9) block (F1/F2): A blocks B → hidden from search + re-request 409')
  r = await api(A.jar, 'POST', '/api/friends/block', { targetUserId: B.id })
  check(r.status === 200 && r.json?.friendship?.status === 'BLOCKED', `block 200 BLOCKED (got ${r.status})`)
  r = await api(A.jar, 'GET', `/api/users/search?q=${encodeURIComponent(B.username)}`)
  check(!r.json?.users?.some(u => u.id === B.id), 'B hidden from A’s search after block')
  r = await api(B.jar, 'POST', '/api/friends/request', { targetUserId: A.id })
  check(r.status === 409, `B re-request to blocker A → 409 (got ${r.status})`)

  console.log('10) /remove cannot lift a block (F1)')
  // discover the BLOCKED row id via a direct DB read (it is intentionally not exposed to B)
  const blockRow = await prisma.friendship.findFirst({ where: { userAId: A.id, userBId: B.id, status: 'BLOCKED' } })
  r = await api(A.jar, 'POST', '/api/friends/remove', { friendshipId: blockRow.id })
  check(r.status === 404, `remove on a BLOCKED row → 404 (got ${r.status})`)
  const stillBlocked = await prisma.friendship.findUnique({ where: { id: blockRow.id } })
  check(!!stillBlocked && stillBlocked.status === 'BLOCKED', 'block row still present after remove attempt')

  console.log('11) unblock (F1): A unblocks B → B searchable again')
  r = await api(A.jar, 'POST', '/api/friends/unblock', { targetUserId: B.id })
  check(r.status === 200, `unblock 200 (got ${r.status})`)
  r = await api(A.jar, 'GET', `/api/users/search?q=${encodeURIComponent(B.username)}`)
  check(!!r.json?.users?.some(u => u.id === B.id), 'B searchable again after unblock')

  console.log('12) self-op guards')
  r = await api(A.jar, 'POST', '/api/friends/request', { targetUserId: A.id })
  check(r.status === 409, `self friend-request → 409 (got ${r.status})`)
  r = await api(A.jar, 'POST', '/api/friends/block', { targetUserId: A.id })
  check(r.status === 409, `self block → 409 (got ${r.status})`)

  console.log('13) auth guard: unauthenticated request → 401')
  r = await api({ cookies: '' }, 'GET', '/api/friends')
  check(r.status === 401, `no-session GET /api/friends → 401 (got ${r.status})`)
}

async function cleanup() {
  console.log('\nCLEANUP')
  for (const u of [A, B]) {
    if (!u.id) continue
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {})
    await adminClient.auth.admin.deleteUser(u.id).catch(() => {})
  }
  await prisma.$disconnect()
  console.log('  test users removed')
}

run()
  .catch(e => { fail++; console.log(`\n💥 ERROR: ${e.message}`) })
  .finally(async () => {
    await cleanup()
    console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──`)
    process.exit(fail === 0 ? 0 : 1)
  })
