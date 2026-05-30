# TESTING_STRATEGY.md — BeActive Testing Plan v2.0

> **Purpose:** What we test, how we test, and what must pass before any deploy.

---

## TESTING PYRAMID

```
        ╱ E2E Tests ╲          (few, slow, high confidence)
       ╱  (Playwright) ╲
      ╱─────────────────╲
     ╱ Integration Tests  ╲     (moderate count, moderate speed)
    ╱   (Vitest + DB)      ╲
   ╱─────────────────────────╲
  ╱      Unit Tests           ╲  (many, fast, focused)
 ╱       (Vitest)              ╲
╱───────────────────────────────╲
```

---

## TOOLS

| Tool | Purpose |
|------|---------|
| Vitest | Unit + integration tests (fast, TypeScript-native) |
| Playwright | E2E browser tests (auth flows, upload, feed) |
| Prisma (test DB) | Integration tests against real PostgreSQL |
| Docker | Local test database |

---

## UNIT TESTS (Fast, Isolated)

### What to unit test:
- **Rule engine rules** — each rule's condition and action independently
- **State machine transitions** — valid and invalid transitions
- **Zod schemas** — valid inputs pass, invalid inputs rejected
- **Utility functions** — time calculations, ranking formulas, string helpers
- **Service layer logic** — with mocked repos and event bus

### Coverage targets:
- State machines: 100% of transitions (valid + invalid)
- Rule engine: 100% of rules
- Zod schemas: all happy + sad paths
- Utils: all exported functions

### Example structure:
```
tests/unit/
  core/
    rules/streak.rules.test.ts
    rules/feed.rules.test.ts
    state-machines/streak.machine.test.ts
    state-machines/workout.machine.test.ts
    state-machines/user.machine.test.ts
  modules/
    auth/auth.service.test.ts
    streaks/streaks.service.test.ts
    posts/posts.service.test.ts
  shared/
    utils/time.test.ts
    utils/ranking.test.ts
```

---

## INTEGRATION TESTS (Service + DB)

### What to integration test:
- **Auth flows** — signup creates user + streak, login returns session
- **Post creation** — validates, stores in DB, emits event
- **Streak updates** — WORKOUT_VERIFIED correctly increments streak
- **Friend operations** — request → accept → feed visibility
- **Feed queries** — only shows friends' verified posts, correct ranking
- **Notification creation** — idempotency key prevents duplicates

### Setup:
- Fresh test database per test suite (or transaction rollback)
- Real Prisma client against test PostgreSQL
- Mocked external services (AI API, R2)

### Example structure:
```
tests/integration/
  auth.integration.test.ts
  posts.integration.test.ts
  streaks.integration.test.ts
  feed.integration.test.ts
  friends.integration.test.ts
  notifications.integration.test.ts
```

---

## E2E TESTS (Browser, Full Stack)

### What to E2E test:
- **Signup → login → see empty feed** (golden path)
- **Upload photo → see PENDING → verified → appears in feed** (core loop)
- **Send friend request → accept → see friend's post** (social)
- **Streak increments after verified workout** (retention core)
- **Notification appears after friend posts** (engagement)

### Playwright setup:
- Run against local dev server
- Seed test database with known state
- Use `page.waitForSelector` for async operations
- Screenshot on failure for debugging

### Example structure:
```
tests/e2e/
  auth.e2e.test.ts
  upload-flow.e2e.test.ts
  feed.e2e.test.ts
  streak.e2e.test.ts
  friends.e2e.test.ts
```

---

## CRITICAL TEST CASES (Must never fail)

### Streak integrity tests:
- [ ] Workout verified → streak increments by exactly 1
- [ ] Two workouts same day → streak increments only once
- [ ] 24h gap → streak breaks
- [ ] Post after break → streak restarts at 1
- [ ] best = MAX(best, current) after every update
- [ ] Cron at 20h → user AT_RISK
- [ ] Cron at 24h → streak BROKEN

### Auth security tests:
- [ ] Unauthenticated request to protected endpoint → 401
- [ ] Invalid session cookie → 401
- [ ] SQL injection in login fields → validation error, not crash
- [ ] Rate limit on login → 429 after 5 attempts

### Data isolation tests:
- [ ] User A cannot see User B's posts (unless friends)
- [ ] User A cannot accept User B's friend request sent to User C
- [ ] Feed only contains posts from accepted friends
- [ ] Notification only delivered to intended recipient

### Upload security tests:
- [ ] File >10MB → rejected
- [ ] Non-image MIME type → rejected
- [ ] Expired signed URL → upload fails gracefully

---

## CI/CD INTEGRATION

```
On every PR:
  1. Run unit tests (must pass)
  2. Run integration tests (must pass)
  3. Lint + type check (must pass)

On merge to main:
  1. All above
  2. Run E2E tests against staging
  3. Auto-deploy to production if all pass
```

---

## TESTING ANTI-PATTERNS

1. **Never test implementation details** — test behavior and outcomes
2. **Never mock what you own** — mock external services only
3. **Never skip streak edge case tests** — streaks are the product
4. **Never write tests that depend on timing** — use deterministic timestamps
5. **Never test in production** — staging environment exists for a reason
