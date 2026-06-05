/**
 * qa-interactions.mjs — Slice 8B engagement smoke (likes + comments) against the
 * live dev server + real DB. Mirrors qa-friends.mjs.
 *
 * PREREQ: the add_post_engagement migration must be applied (PostLike/PostComment
 * tables) and the dev server running (npm run dev).
 *   node --env-file=app/web/.env.local qa-interactions.mjs
 *
 * Seeds A & B (accepted friends) + C (non-friend) + one VERIFIED post by A, then
 * drives the real HTTP API: view-gate, like idempotency, unlike, comments, feed
 * counts, non-friend 404, self-like, comment validation. Cleans up.
 */
import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const prisma = new PrismaClient()
const RUN = Date.now()
const PW = 'QATestPass123!'
const mk = (k) => ({ email: `qa-int-${k}-${RUN}@beactive.test`, username: `qaint${k}${RUN}`, jar: { cookies: '' }, id: '' })
const A = mk('a'), B = mk('b'), C = mk('c')
let postId = ''
let pass = 0, fail = 0
const check = (cond, msg) => { if (cond) { pass++; console.log(`  ✅ ${msg}`) } else { fail++; console.log(`  ❌ ${msg}`) } }

async function api(jar, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: jar.cookies },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const sc = res.headers.getSetCookie?.() ?? []
  if (sc.length) {
    const ex = Object.fromEntries(jar.cookies.split('; ').filter(Boolean).map((c) => [c.split('=')[0], c]))
    for (const raw of sc) { const p = raw.split(';')[0]; ex[p.split('=')[0]] = p }
    jar.cookies = Object.values(ex).join('; ')
  }
  let json = null; try { json = JSON.parse(await res.text()) } catch {}
  return { status: res.status, json }
}

async function seedUser(u) {
  const { data, error } = await admin.auth.admin.createUser({ email: u.email, password: PW, email_confirm: true, user_metadata: { username: u.username } })
  if (error) throw new Error(error.message)
  u.id = data.user.id
  await prisma.user.create({ data: { id: u.id, email: u.email, username: u.username, streak: { create: { current: 0, best: 0, status: 'INACTIVE' } } } })
  const r = await api(u.jar, 'POST', '/api/auth/login', { email: u.email, password: PW })
  if (r.status !== 200 || !u.jar.cookies) throw new Error(`login ${u.email} failed: ${r.status}`)
}

async function run() {
  console.log(`\n── Interactions smoke · run ${RUN} · ${BASE} ──\n`)
  console.log('SETUP: users A,B,C + A↔B friendship + A VERIFIED post')
  await seedUser(A); await seedUser(B); await seedUser(C)
  await prisma.friendship.create({ data: { userAId: A.id, userBId: B.id, status: 'ACCEPTED' } })
  const post = await prisma.post.create({
    data: { userId: A.id, imageUrl: `https://cdn/${RUN}.jpg`, imageKey: `posts/${A.id}/${RUN}.jpg`, status: 'VERIFIED' },
  })
  postId = post.id
  console.log(`  A=${A.id} B=${B.id} C=${C.id} post=${postId}\n`)

  console.log('1) visibility gate on the post')
  check((await api(B.jar, 'GET', `/api/posts/${postId}`)).status === 200, 'friend B can view the post (200)')
  check((await api(C.jar, 'GET', `/api/posts/${postId}`)).status === 404, 'non-friend C cannot view (404)')

  console.log('2) like + idempotency + unlike')
  let r = await api(B.jar, 'POST', `/api/posts/${postId}/like`)
  check(r.status === 200 && r.json?.liked === true && r.json?.likeCount === 1, `B like → liked, count 1 (got ${r.status}/${r.json?.likeCount})`)
  r = await api(B.jar, 'POST', `/api/posts/${postId}/like`)
  check(r.status === 200 && r.json?.likeCount === 1, `B like again → idempotent, still 1 (got ${r.json?.likeCount})`)
  r = await api(C.jar, 'POST', `/api/posts/${postId}/like`)
  check(r.status === 404, `non-friend C like → 404 (got ${r.status})`)

  console.log('3) feed reflects engagement (B sees A’s post with counts)')
  r = await api(B.jar, 'GET', '/api/feed?limit=20')
  const fp = r.json?.posts?.find((p) => p.id === postId)
  check(!!fp, 'A’s post appears in B’s feed')
  check(fp?.likeCount === 1 && fp?.likedByMe === true, `feed shows likeCount 1 + likedByMe true (got ${fp?.likeCount}/${fp?.likedByMe})`)

  console.log('3b) PROFILE posts carry the same engagement shape (B views A’s profile)')
  r = await api(B.jar, 'GET', `/api/users/${encodeURIComponent(A.username)}/posts`)
  const pp = r.json?.posts?.find((p) => p.id === postId)
  check(!!pp, 'A’s post appears in A’s profile posts')
  check(pp?.likeCount === 1 && pp?.likedByMe === true, `profile post shows likeCount 1 + likedByMe true (got ${pp?.likeCount}/${pp?.likedByMe})`)
  check(!!pp?.user?.username && typeof pp?.commentCount === 'number', 'profile post is in FeedCard shape (user + commentCount) → renders like/comment/share')

  console.log('4) comments: create, validate, list')
  r = await api(B.jar, 'POST', `/api/posts/${postId}/comments`, { body: 'great work!' })
  check(r.status === 201 && r.json?.comment?.body === 'great work!', `B comment → 201 (got ${r.status})`)
  check((await api(B.jar, 'POST', `/api/posts/${postId}/comments`, { body: '   ' })).status === 400, 'empty comment → 400')
  check((await api(C.jar, 'POST', `/api/posts/${postId}/comments`, { body: 'hi' })).status === 404, 'non-friend C comment → 404')
  r = await api(B.jar, 'GET', `/api/posts/${postId}/comments`)
  check(r.status === 200 && r.json?.comments?.some((c) => c.body === 'great work!'), 'GET comments lists B’s comment')

  console.log('5) self-like (author likes own post) + unlike')
  check((await api(A.jar, 'POST', `/api/posts/${postId}/like`)).status === 200, 'A can like own post (200)')
  r = await api(B.jar, 'DELETE', `/api/posts/${postId}/like`)
  check(r.status === 200 && r.json?.liked === false, `B unlike → liked false (got ${r.status})`)
  r = await api(B.jar, 'DELETE', `/api/posts/${postId}/like`)
  check(r.status === 200, 'B unlike again → idempotent 200')

  console.log('6) auth guard')
  check((await api({ cookies: '' }, 'POST', `/api/posts/${postId}/like`)).status === 401, 'unauthenticated like → 401')

  console.log('7) avatar: set / ownership / public visibility / remove')
  r = await api(A.jar, 'PATCH', '/api/users/me', { avatarKey: `avatars/${A.id}/qa.jpg` })
  check(r.status === 200 && (r.json?.user?.avatarUrl ?? '').endsWith(`avatars/${A.id}/qa.jpg`), `A sets avatar → avatarUrl stored (got ${r.status})`)
  r = await api(B.jar, 'GET', `/api/users/${encodeURIComponent(A.username)}`)
  check(!!r.json?.profile?.avatarUrl, 'A’s avatar is visible on A’s public profile (to friend B)')
  r = await api(A.jar, 'PATCH', '/api/users/me', { avatarKey: `avatars/${B.id}/x.jpg` })
  check(r.status === 403, `A cannot claim B’s avatar key → 403 (ownership) (got ${r.status})`)
  r = await api(A.jar, 'PATCH', '/api/users/me', { avatarKey: null })
  check(r.status === 200 && !r.json?.user?.avatarUrl, 'A removes avatar → avatarUrl cleared')
}

async function cleanup() {
  console.log('\nCLEANUP')
  try { if (postId) await prisma.post.delete({ where: { id: postId } }).catch(() => {}) } catch {}
  for (const u of [A, B, C]) { if (u.id) { await prisma.user.delete({ where: { id: u.id } }).catch(() => {}); await admin.auth.admin.deleteUser(u.id).catch(() => {}) } }
  await prisma.$disconnect()
  console.log('  cleaned up')
}

run().catch((e) => { fail++; console.log(`\n💥 ${e.message}`) }).finally(async () => {
  await cleanup()
  console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──`)
  process.exit(fail === 0 ? 0 : 1)
})
