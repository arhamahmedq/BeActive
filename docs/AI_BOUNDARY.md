# AI_BOUNDARY.md — BeActive AI Safety & Integration v2.0

> **Purpose:** Defines exactly what AI can and cannot do. Non-negotiable boundary.

---

## 1. AI ROLE IN BEACTIVE

AI serves exactly ONE purpose: **classify uploaded images as workouts or not**.

AI is a **sensor**, not a **brain**. It observes and reports. It never decides or acts.

---

## 2. THE LOCKED BOX (Non-Negotiable)

### AI CAN ✓
- Receive an image (raw bytes)
- Receive a post ID (for correlation)
- Return a classification payload
- Be called by an async worker
- Report processing time and model version

### AI CANNOT ✗
- Write to any database table
- Read from any table except via the image bytes passed to it
- Trigger state machine transitions
- Override the rule engine
- Access user profiles, streaks, friend data, or feed data
- Determine whether a streak should increment
- Rank or filter feed posts
- Send notifications
- Make any decision beyond classification

---

## 3. CLASSIFICATION INTERFACE

### Input
```typescript
interface AIClassificationInput {
  imageUrl: string    // R2 URL of uploaded image
  postId: string      // For correlation in response
}
```

### Output
```typescript
interface AIClassificationOutput {
  isWorkout: boolean
  type: 'gym' | 'running' | 'cycling' | 'swimming' | 'outdoor' | 'sports' | 'other'
  confidence: number         // 0.00 – 1.00
  processingTimeMs: number   // Latency tracking
  modelVersion: string       // e.g. "claude-3-sonnet-20240229" or "gpt-4-vision"
}
```

### Confidence Thresholds
| Range | Classification | Action |
|-------|---------------|--------|
| ≥ 0.70 | VERIFIED | Rule R1 fires → streak update, feed post |
| 0.50 – 0.69 | AMBIGUOUS | Mark PENDING, notify user, flag for manual review |
| < 0.50 | REJECTED | Rule R2 fires → notify user, suggest re-upload |

---

## 4. PROCESSING FLOW

```
WORKOUT_UPLOADED event
    │
    ▼
AI Worker (async) picks up event from queue
    │
    ▼
Fetches image from R2 URL
    │
    ▼
Sends to AI Provider API (Claude Vision / OpenAI Vision)
    │
    ├── Success → Parse response → Emit WORKOUT_VERIFIED or WORKOUT_REJECTED
    │
    ├── Timeout (>10s) → Retry once → If still fails, mark PENDING + manual review flag
    │
    ├── API Error → Retry with exponential backoff (1s, 4s, 16s) → Max 3 attempts
    │
    └── Complete failure → Post stays PENDING, admin notified, user notified
```

---

## 5. AI PROVIDER STRATEGY

### MVP (Current)
- **Primary provider:** Google Gemini Flash — `gemini-2.0-flash`
- **Secondary provider:** Claude Vision — `claude-haiku-4-5-20251001` (Anthropic)
- **Provider selection:** `AI_PROVIDER` env var (`"gemini"` default, `"claude"` optional)
- **Method:** Vision classification via structured JSON prompt (shared prompt, both providers)
- **Latency:** ~2-4 seconds (fits within Vercel 10s free-tier timeout)
- **Cost:** Free tier on Google AI Studio (Gemini); ~$0.01/image (Claude)

**Why this over HuggingFace CLIP:**
- HuggingFace Inference SDK v4 removed `openai/clip-vit-base-patch32` from all inference provider mappings (neither auto-selection nor explicit `hf-inference` provider works)
- HuggingFace free tier cold starts (20–30s) would exceed Vercel's 10s function timeout
- Gemini/Claude Vision produce more accurate, context-aware classification

**Provider abstraction:**
- The `AI_PROVIDER` env var controls which provider is used at runtime
- Both providers use the same `ClassificationOutput` interface
- Switching providers requires only an env var change — no code changes

### Scale
- Add provider fallback (try Gemini, fallback to Claude on failure)
- Cost optimization (Gemini free tier first, Claude for ambiguous edge cases)
- Custom fine-tuned model on BeActive fitness data

### Prompt Engineering
The classification prompt (shared across providers):
- Structured JSON output only (no prose — easier parsing, consistent shape)
- Explicit confidence calibration (≥0.70 = clearly workout, 0.50–0.69 = ambiguous, <0.50 = not workout)
- Type mapping to BeActive's WorkoutType enum (GYM, RUNNING, CYCLING, SWIMMING, OUTDOOR, SPORTS, OTHER)

---

## 6. FAILURE HANDLING

| Failure | Behavior |
|---------|----------|
| API timeout (>10s) | Retry once with fresh request |
| API returns 429 (rate limit) | Exponential backoff, max 3 retries |
| API returns 500 | Retry with backoff, alert if >3 failures/hour |
| API returns malformed response | Log error, mark PENDING, flag for manual review |
| API unavailable for >5 minutes | Circuit breaker opens, queue events, alert admin |
| Confidence exactly 0.70 | Treated as VERIFIED (≥ threshold) |

---

## 7. COST MANAGEMENT

| Metric | Value |
|--------|-------|
| Estimated cost per classification | $0.01 – $0.03 |
| Daily budget at 1k users (1 post/day) | $10 – $30 |
| Daily budget at 100k users | $1,000 – $3,000 |
| Optimization: cache known-good image hashes | Reduces repeat classifications |
| Optimization: confidence-tiered models | Cheap model first, expensive only for ambiguous |

---

## 8. SECURITY

- AI API key stored in environment variables only
- Key never exposed to frontend or client
- Key rotated quarterly
- AI worker runs in server-side context only
- No user data beyond the image is sent to AI provider
- AI provider's data retention policies must be reviewed

---

## 9. MONITORING

Track these metrics from day 1:
- Classification latency (p50, p95, p99)
- Confidence score distribution (histogram)
- Verification rate (% of uploads that pass)
- Rejection rate and reasons
- API error rate
- Cost per classification

Alert on:
- Classification latency > 10s for >5 minutes
- Error rate > 5% in any 15-minute window
- Verification rate drops below 50% (possible model issue)

---

## 10. FUTURE EVOLUTION

| Phase | Addition |
|-------|---------|
| Post-MVP | Manual review queue for ambiguous classifications |
| Growth | Provider abstraction layer (multi-provider) |
| Scale | Custom fine-tuned model trained on BeActive data |
| Platform | NSFW detection, content moderation, object recognition |

---

## CORE PRINCIPLE

**AI is a thermometer, not a thermostat.** It measures (classifies). It does not control (decide streaks, feeds, or state). The rule engine and state machines are the thermostat.
