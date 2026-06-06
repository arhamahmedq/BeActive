# BeActive — Vercel Deployment Guide

> **Last updated:** 2026-06-05  
> **Status:** Production-ready (Hobby tier compatible)

---

## Architecture Overview

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend + API | Next.js 16 (App Router) | Vercel |
| Database | PostgreSQL (Prisma) | Supabase managed |
| Auth | Supabase Auth (JWT + HTTP-only cookies) | Supabase |
| Object storage | Cloudflare R2 | Cloudflare |
| AI classification | Gemini Flash 2.0 | Google AI Studio |
| Cron jobs | Vercel Cron | Vercel |

---

## First-Time Deployment

### 1. Connect Vercel project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `BeActive` GitHub repository
3. **Set Root Directory → `app/web`** ← critical for monorepo
4. Framework preset: Next.js (auto-detected)
5. Build command: auto-detected from `app/web/vercel.json`
6. Do NOT deploy yet — configure environment variables first

### 2. Set environment variables

Add all variables below in Vercel dashboard → Settings → Environment Variables.  
Set scope: **Production**, **Preview**, **Development** unless noted.

#### Database (Supabase)
```
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:5432/postgres
```
- `DATABASE_URL` uses Supabase's **PgBouncer pooler** (port 6543) — required for serverless
- `DIRECT_URL` uses the **direct connection** (port 5432) — used by Prisma Migrate only

#### Supabase Auth
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
```
- `SUPABASE_SERVICE_KEY` is SERVER-ONLY — never prefix with `NEXT_PUBLIC_`

#### Cloudflare R2 Storage
```
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=beactive-uploads
R2_PUBLIC_URL=https://your-bucket.your-domain.com
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
```
- `R2_PUBLIC_URL` is used in the Content-Security-Policy `img-src` header — **must be set before first build**

#### AI Classification
```
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
```
- `AI_PROVIDER` accepts `gemini` (default) or `claude`
- If `AI_PROVIDER=claude`: add `AI_API_KEY=sk-ant-...`

#### App
```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```
- Set to the actual production URL (not localhost)
- Do NOT set `NEXT_PUBLIC_STREAK_DEBUG=true` in production

#### Cron protection
```
CRON_SECRET=<generate with: openssl rand -hex 32>
```
- Vercel sends `Authorization: Bearer <CRON_SECRET>` to cron routes
- The streak evaluator route validates this header

#### Optional (recommended for production)
```
UPSTASH_REDIS_REST_URL=https://your-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
SENTRY_DSN=https://xxx@o0.ingest.sentry.io/0
```

### 3. Configure Supabase redirect URLs

In Supabase dashboard → Authentication → URL Configuration:

**Site URL:** `https://your-app.vercel.app`

**Redirect URLs (add all of these):**
```
https://your-app.vercel.app/api/auth/callback
https://your-app.vercel.app/**
http://localhost:3000/api/auth/callback
http://localhost:3000/**
```

### 4. Configure R2 CORS

In Cloudflare dashboard → R2 → your bucket → Settings → CORS:

```json
[
  {
    "AllowedOrigins": ["https://your-app.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "DELETE"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

Without this, presigned upload PUTs will fail from the browser in production.

### 5. Apply database migrations

Run migrations against the Supabase database (use `DIRECT_URL`, not the pooler):

```bash
DATABASE_URL=$DIRECT_URL npx prisma migrate deploy --schema prisma/schema.prisma
```

Or via Supabase dashboard → SQL Editor → paste the migration files in order.

### 6. Deploy

Click **Deploy** in the Vercel dashboard, or push to `master` — Vercel auto-deploys on push.

---

## Deployment Process (ongoing)

```
git push origin master
```

Vercel auto-deploys master → production. Preview deployments are created for all other branches.

### Build steps (automated by Vercel)

1. `npm install` (from `app/web/`)
2. `npx prisma generate --schema ../../prisma/schema.prisma` (generates Prisma client)
3. `next build` (compiles Next.js)

### Database migrations (manual, before code deploy)

```bash
npx prisma migrate deploy --schema prisma/schema.prisma
```

Always apply migrations **before** deploying code that depends on the new schema.

---

## Known Limitations (Hobby / Free Tier)

### Rate limiting is per-invocation
The in-memory rate limiter resets on each cold Vercel invocation. It provides protection within a single request burst but not across invocations. **Fix before launch:** provision Upstash Redis via Vercel Marketplace and swap the rate limiter implementation.

### AI classification timeout risk
`POST /api/posts/create` uses `after()` to run AI classification after the response. On Hobby tier (10s function timeout), classification that takes >10s will be killed. The post stays `PENDING` — the upload UI handles this with a "still checking" state. Classification timeout is rare with Gemini Flash (typical: 1–3s).

**If needed:** upgrade to Pro plan (60s timeout) and increase `maxDuration` in `app/web/vercel.json`:
```json
{
  "functions": {
    "app/api/posts/create/route.ts": { "maxDuration": 60 },
    "app/api/cron/streak-evaluator/route.ts": { "maxDuration": 60 }
  }
}
```

### Event bus is in-process only
The `EventEmitter` event bus is a process-level singleton. Events emitted in one serverless invocation are not visible in another. This is by design — the bus is for best-effort side effects (Slice 7 notifications) that run within the same invocation. Streak updates and post classification are direct awaited calls, not bus events.

---

## Localhost vs Production Comparison

| Feature | Localhost | Production | Difference |
|---------|-----------|------------|------------|
| Auth sessions | HTTP-only cookies, SameSite=Lax | Same | Identical |
| Supabase calls | Direct to Supabase URL | Same | Identical |
| R2 presigned uploads | `fetch()` PUT to R2 | Same (CORS must be configured) | Requires R2 CORS config |
| AI classification | Runs synchronously via `after()` | Same API, possible timeout on Hobby | Timeout risk on free tier |
| Rate limiting | In-memory, per-process | In-memory, per-invocation (resets) | Effectively disabled between requests |
| Cron (streak evaluator) | Manual: `GET /api/cron/streak-evaluator` | Vercel Cron, hourly | Identical logic, automated trigger |
| Prisma connection | Direct PostgreSQL | PgBouncer pooler (connection_limit=1) | `DATABASE_URL` must use pooler |
| Event bus | Per-process singleton, persistent | Per-invocation singleton, ephemeral | Side effects only, no state loss |
| `NEXT_PUBLIC_STREAK_DEBUG` | Can be `"true"` | Must NOT be `"true"` | Admin debug panel hidden |

---

## Rollback Process

### Vercel deployment rollback
1. Vercel dashboard → Deployments
2. Click the previous successful deployment
3. Click "..." → **Promote to Production**

Rollback takes ~30 seconds. No code change required.

### Database rollback
Prisma does not auto-rollback migrations. For a broken migration:

1. Write a reverse migration SQL manually
2. Apply via `prisma migrate resolve --reverted <migration_name>`
3. Or restore from Supabase point-in-time backup

**Prevention:** always apply migrations to a staging environment first.

---

## Common Failures & Fixes

### Build fails: "Cannot find module '@prisma/client'"
**Cause:** `prisma generate` didn't run or failed.  
**Fix:** Check the build log — the `prisma generate` step runs before `next build`. Verify `DATABASE_URL` is not required for `generate` (it isn't — only the schema file is needed).

### Build fails: "R2_PUBLIC_URL is empty" / CSP img-src is broken
**Cause:** `R2_PUBLIC_URL` not set as a Vercel environment variable.  
**Fix:** Add `R2_PUBLIC_URL` to Vercel env vars and redeploy.

### Login redirects to `/login` in a loop
**Cause:** Supabase redirect URL not configured for production domain.  
**Fix:** Add `https://your-app.vercel.app/**` to Supabase Redirect URLs.

### Image uploads work on localhost but fail in production (CORS error)
**Cause:** R2 bucket CORS not configured.  
**Fix:** Add the production origin to R2 bucket CORS settings (see Setup step 4).

### Avatar/workout uploads: presigned URL returns 403
**Cause:** `Content-Type` header mismatch — the client sends a different MIME type than what was signed.  
**Fix:** Check `useUpdateAvatar.ts` and `upload/page.tsx` — both use `image.type` from the actual Blob for both signing and uploading.

### Cron not running
**Cause:** `CRON_SECRET` not set in Vercel env vars, or `app/web/vercel.json` crons not being read.  
**Fix:** Verify Vercel Root Directory is set to `app/web`. Check `CRON_SECRET` is set. Test manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/streak-evaluator`.

### `/api/health` returns `{"ok":false,"checks":{"database":false}}`
**Cause:** `DATABASE_URL` not set or points to wrong endpoint.  
**Fix:** Ensure `DATABASE_URL` uses the Supabase PgBouncer pooler URL with `?pgbouncer=true&connection_limit=1`.

### Posts stuck as PENDING (AI classification never completes)
**Cause:** `GEMINI_API_KEY` not set, or classification timed out on Hobby tier.  
**Fix:** Verify `GEMINI_API_KEY` is set. If timing out, upgrade to Pro or lower `MAX_ATTEMPTS` in `aiClassifier.ts`.

---

## Debugging Guide

### Check function logs
Vercel dashboard → Logs → filter by route (e.g., `/api/posts/create`)

### Check health endpoint
```
GET https://your-app.vercel.app/api/health
```
Returns `{"ok":true,"checks":{"database":true}}` when database is reachable.

### Test cron manually
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.vercel.app/api/cron/streak-evaluator
```

### Inspect auth session
```bash
curl -b "sb-xxx-auth-token=..." \
  https://your-app.vercel.app/api/auth/session
```

### Verify R2 connectivity
Upload a workout post — the presigned URL from `/api/uploads/sign` should reach R2. Check browser Network tab for the PUT request to `*.r2.cloudflarestorage.com`.

---

## Environment Variables Checklist

| Variable | Required | Secret | Notes |
|----------|----------|--------|-------|
| `DATABASE_URL` | ✅ | ✅ | Pooler URL (port 6543) |
| `DIRECT_URL` | ✅ | ✅ | Direct URL (port 5432), migrations only |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ❌ | Public, safe for client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ❌ | Public, safe for client |
| `SUPABASE_SERVICE_KEY` | ✅ | ✅ | Server-only, never NEXT_PUBLIC_ |
| `R2_ACCESS_KEY_ID` | ✅ | ✅ | |
| `R2_SECRET_ACCESS_KEY` | ✅ | ✅ | |
| `R2_BUCKET_NAME` | ✅ | ❌ | |
| `R2_PUBLIC_URL` | ✅ | ❌ | Used in CSP at build time |
| `R2_ENDPOINT` | ✅ | ❌ | |
| `AI_PROVIDER` | ✅ | ❌ | `gemini` or `claude` |
| `GEMINI_API_KEY` | ✅* | ✅ | *Required if AI_PROVIDER=gemini |
| `AI_API_KEY` | ❌* | ✅ | *Required if AI_PROVIDER=claude |
| `NEXT_PUBLIC_APP_URL` | ✅ | ❌ | Production URL |
| `CRON_SECRET` | ✅ | ✅ | Protects streak evaluator cron |
| `NEXT_PUBLIC_STREAK_DEBUG` | ❌ | ❌ | Never set in production |
| `UPSTASH_REDIS_REST_URL` | ❌* | ✅ | *Needed for reliable rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | ❌* | ✅ | *Needed for reliable rate limiting |
| `SENTRY_DSN` | ❌ | ❌ | Recommended for production error tracking |
