# FAILURE_MODES.md — BeActive Failure Handling v2.0

> **Purpose:** Every way the system can break, and exactly how we recover.

---

## SEVERITY LEVELS

| Level | Definition | Response Time | Example |
|-------|-----------|---------------|---------|
| P0 — Critical | System unusable, data loss risk | Immediate | DB down, auth broken |
| P1 — Major | Core feature broken | <1 hour | Streaks not updating, uploads failing |
| P2 — Moderate | Feature degraded | <4 hours | Notifications delayed, feed slow |
| P3 — Minor | Cosmetic or edge case | Next sprint | UI glitch, rare edge case |

---

## AUTH FAILURES

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| Supabase Auth unavailable | No login/signup | Health check fails | Retry with backoff. Show maintenance message. |
| Session cookie corrupted | User logged out unexpectedly | 401 on protected route | Clear cookies, redirect to login |
| Refresh token rotation fails | Session expires early | User reports forced logout | Re-authenticate. Log for debugging. |
| Rate limit triggered on login | Legitimate user locked out | 429 response | Show "try again in X seconds" UI |

---

## UPLOAD FAILURES

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| R2 signed URL expired | Upload fails | 403 from R2 | Client requests new signed URL, retries upload |
| R2 service unavailable | All uploads fail | Signed URL generation fails | Queue locally, retry. Show offline state. |
| File too large (>10MB) | Upload rejected | Server-side validation | Return clear error, suggest compression |
| Invalid MIME type | Upload rejected | Server-side validation | Return specific error message |
| EXIF stripping fails | Upload succeeds but metadata exposed | Error in processing pipeline | Reject upload, log error. Never serve unstripped images. |
| Client disconnects mid-upload | Orphaned R2 object | No post record created | Cron job cleans orphaned R2 objects daily |

---

## AI CLASSIFICATION FAILURES

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| AI API timeout (>10s) | Post stuck in PENDING | Worker timeout | Retry once. If still fails, mark for manual review. |
| AI API rate limited (429) | Delayed classification | 429 response | Exponential backoff: 1s → 4s → 16s. Max 3 retries. |
| AI API 500 error | Classification fails | Error response | Retry 3x with backoff. If persistent, circuit breaker. |
| AI returns malformed JSON | Cannot parse result | JSON parse error | Log full response, mark PENDING, flag for review. |
| AI confidence in ambiguous range (0.50-0.69) | User uncertain | Confidence check | Mark PENDING, notify user "under review". |
| AI model degraded (low accuracy) | False verifications/rejections | Confidence distribution drift | Alert on verification rate changes. Fall back to previous model. |
| AI provider changes pricing | Cost spike | Billing alert | Provider abstraction layer enables swap. |

---

## STREAK FAILURES

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| Cron job fails to run | No AT_RISK/BROKEN transitions | Health check on cron schedule | Next run catches up via timestamps (not wall clock). |
| Cron processes same user twice | Double notification | Idempotency key check | Notification deduplication via `userId:type:date` key. |
| Duplicate WORKOUT_VERIFIED event | Double streak increment | Compare post.createdAt with lastVerifiedAt | Skip if same post already processed. |
| DB write fails during streak update | Desynchronized streak | Error log, failed write | Retry with same event. Event log enables replay. |
| Clock skew between services | Incorrect hour calculations | Timestamp comparison | All times from DB (UTC), never system clock. |

---

## FEED FAILURES

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| Feed query timeout | User sees loading forever | Query timeout threshold | Return cached result. Optimize query. |
| Empty feed (no friends) | Poor first experience | Check friend count | Show "Add friends" CTA with search. |
| Feed shows non-friend posts | Data leak (security) | Integration test failure | Auth middleware + WHERE clause enforcement. |
| Pagination cursor invalid | Feed breaks on scroll | Invalid cursor detection | Reset to beginning, return first page. |

---

## NOTIFICATION FAILURES

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| Duplicate notification sent | User spammed | Idempotency key violation | Catch unique constraint error, skip. |
| Notification not delivered | User misses streak warning | Delivery confirmation check | Retry delivery. Fall back to in-app. |
| Push notification service down | No push delivery | Health check | Fall back to in-app notifications only. |

---

## DATABASE FAILURES

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| Connection pool exhausted | All queries fail | Connection count monitoring | Increase pool size. Queue requests. |
| Write timeout | Mutation fails | Query timeout | Retry once. If persistent, circuit breaker. |
| Migration failure | Schema inconsistent | Migration script error | Rollback migration. Fix and redeploy. |
| Data corruption | Incorrect state | Integrity checks | Replay events from event log to rebuild state. |

---

## INFRASTRUCTURE FAILURES

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| Vercel deployment fails | Old version stays live | Deploy status check | Rollback to previous deployment. Fix and redeploy. |
| Supabase outage | DB + Auth unavailable | Health check | Maintenance page. Wait for recovery. |
| R2 outage | No image access | Image load failures | CDN cache serves existing images. New uploads queued. |
| DNS failure | App unreachable | External monitoring | Cloudflare/Vercel handles failover. |

---

## RECOVERY PRINCIPLES

1. **Events are the recovery mechanism** — if state is corrupted, replay events to rebuild it
2. **Idempotency everywhere** — retrying any operation produces the same result
3. **Graceful degradation** — if a subsystem fails, others continue working
4. **Never lose user data** — writes to DB are confirmed before acknowledging to user
5. **Alert early, fix fast** — monitoring catches issues before users report them
