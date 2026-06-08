# BeActive Story Sharing System
## Product Spec + Architecture Reference v1.0

> **Status:** Phase 1 in progress (2026-06-08)
> **Purpose:** Viral acquisition engine — turn workout completions into shareable story cards.
> **Phases:** 1 = static PNG (now) | 2 = animated (future) | 3 = Wrapped (future)

---

## 1. PRODUCT VISION

BeActive story cards turn every workout completion into a branded social asset. When a user finishes a workout and sees their streak grow, the emotional peak is immediate — the share button must be right there, and the card must be so beautiful they *want* to post it.

**The analogy stack:**
- Strava activity cards → data-as-achievement
- Spotify Wrapped → personalized visual storytelling
- Duolingo streak sharing → habit-loop reinforcement
- Apple Fitness achievement → premium, earned feeling

**What makes BeActive unique:** The streak plant evolution system gives every share a narrative. A 7-day post looks different from a 30-day post. A plant evolution moment (🌿 → 🪴) is a Pokémon-level emotional trigger.

**The loop:**
```
User completes workout → streak increments → plant evolves (maybe)
  → celebration screen → story card generated
  → shared to Instagram/Snapchat/Telegram Stories
  → viewers tap "what's this?" → install BeActive
  → organic acquisition, zero ad spend
```

---

## 2. GROWTH STRATEGY

### Primary acquisition mechanism
Story shares are the primary top-of-funnel. Every card contains:
1. A visually striking workout photo (the user's own)
2. A large, beautiful streak plant at the appropriate evolution level
3. The BeActive logo — subtle but present
4. A clear "what happened" narrative (PUSH DAY COMPLETED / 30 DAY STREAK)

### Virality factors
| Factor | Design decision |
|--------|-----------------|
| **Identity** | User's actual workout photo makes it personal, not generic |
| **Achievement** | Streak count + plant level signal real commitment |
| **Aspiration** | Viewers see what consistency looks like — they want it |
| **Branding** | Logo present but never spammy — more Spotify, less mobile game |
| **Platform native** | 1080×1920 vertical = native Instagram/Snapchat story format |

### Share moments ranked by virality potential
1. **Plant evolution** (🌱→🌿, 🌿→🪴, etc.) — rarest, most emotional
2. **Streak milestones** (7, 14, 30, 50, 100, 365 days) — prestige moment
3. **New personal best** — pride trigger
4. **Daily workout completion** — habit reinforcement, lowest friction

---

## 3. USER FLOWS

### Phase 1 share flow
```
Upload page → workout verified (VERIFIED status)
  → Celebration screen ("recorded" stage)
  → "Share Your Story" button visible
  → User taps button
  → Loading state (~1-2s while card generates server-side)
  → Native OS share sheet opens (iOS/Android)
  → User selects Instagram Stories / Snapchat / Telegram
  → Story opens with image pre-loaded
  → User taps "Your Story" / "Post"
  → Done
```

### Fallback flow (desktop or browsers without Files share)
```
User taps "Share Your Story"
  → Card generates server-side
  → Card downloads as "beactive-story.png"
  → User posts manually
```

### What users cannot do
- Generate story cards for other users' workouts (enforced server-side — postId must belong to requesting user)
- Generate cards for PENDING or REJECTED posts (only VERIFIED posts)
- Re-use another user's card

---

## 4. TECHNICAL ARCHITECTURE (Phase 1)

### Technology choices
| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Card generation | `next/og` (`ImageResponse` + Satori) | Zero extra deps, runs at edge, returns PNG in ~200ms |
| Image dimensions | 1080 × 1920 px | Native Instagram/Snapchat story format |
| Share mechanism | Web Share API (`navigator.share({ files })`) | Native OS share sheet = direct Instagram/Snapchat targets |
| Fallback | `<a download>` trigger | Desktop browsers or unsupported mobile browsers |
| Auth | Existing `requireAuth` cookie middleware | User can only share their own verified posts |

### Request flow
```
Client: fetch('/api/stories/generate?postId=X')
  → Server: requireAuth() — verifies session cookie
  → Server: load post from DB — verifies post.userId === auth.userId, status === VERIFIED
  → Server: load streak for user
  → Server: load user profile (username, avatarUrl)
  → Server: ImageResponse(JSX, { width: 1080, height: 1920 })
  → Client: receives PNG blob
  → Client: navigator.share({ files: [File('beactive-story.png', blob)] })
  → OS: opens native share sheet
```

### API contract
```
GET /api/stories/generate?postId={id}

Auth: required (session cookie)
Rate limit: 10/hour per user (story generation is compute-intensive)

Success: 200 image/png (1080×1920 PNG)
Errors:
  401 UNAUTHORIZED — no session
  403 FORBIDDEN — post belongs to another user
  404 NOT_FOUND — post not found or not VERIFIED
  429 RATE_LIMITED — too many story generations
  500 INTERNAL_ERROR — generation failed
```

### Data consumed per story card
| Data | Source | Field |
|------|--------|-------|
| Workout photo | `Post.imageUrl` | R2 public URL |
| Workout type | `Workout.type` | GYM / RUNNING / etc. |
| Username | `User.username` | @handle |
| Avatar | `User.avatarUrl` | R2 public URL (nullable) |
| Streak count | `Streak.current` | integer |
| Best streak | `Streak.best` | integer |
| Plant level | derived from `Streak.current` | 0–6 |
| Is personal best | `Streak.current === Streak.best && current > 1` | boolean |
| Post status | `Post.status` | must be VERIFIED |

---

## 5. STORY CARD DESIGN SPECIFICATION (1080 × 1920)

### Design philosophy
Premium, editorial, athletic. The card should feel like a luxury fitness magazine spread — not a dashboard screenshot or a social media post. Visual priority:

1. Streak plant (hero of the BeActive brand)
2. User's workout photo (personal proof)
3. Achievement / streak milestone
4. Workout type label
5. BeActive branding (subtle)

### Zone breakdown

```
┌─────────────────────────────────────────┐ y=0
│           LOGO ZONE (160px)             │ ← "> Be Active"
├─────────────────────────────────────────┤ y=160
│         USER BAR (104px)                │ ← @username | DAY X | Lv.N
├─────────────────────────────────────────┤ y=292
│                                         │
│         HERO ZONE (764px)               │ ← workout photo full-bleed
│     ┌─────────────────────────┐         │ ← gradient fade bottom
│     │    PLANT (240px emoji)  │         │ ← large plant emoji + glow
│     └─────────────────────────┘         │
├─────────────────────────────────────────┤ y=1056
│                                         │
│        DATA CARD (784px)                │ ← glass-simulated white card
│  ┌──────────────────────────────────┐   │
│  │ [icon] WORKOUT TYPE              │   │
│  │ ██████████████ COMPLETED         │   │ ← 80px ultra-bold
│  │ ──────────────────────────────── │   │
│  │ 🔥 X   |   🌿 LEVEL   |  🏆 BEST│   │
│  │ ┌──────────────────────────────┐ │   │
│  │ │ 🌿  X DAY STREAK  ████░░░  🪴│ │   │
│  │ └──────────────────────────────┘ │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤ y=1840
│           FOOTER (80px)                 │ ← "> BeActive"
└─────────────────────────────────────────┘ y=1920
```

### Color system
| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#F0F0EE` | Card background |
| Brand green | `#22C55E` | Accents, highlights, plant glow |
| Brand green dark | `#16A34A` | Streak number emphasis |
| Near-black | `#111827` | Headlines, primary text |
| Body | `#374151` | Secondary text |
| Muted | `#9CA3AF` | Labels, eyebrow text |
| White card | `rgba(255,255,255,0.95)` | Data card background |
| White border | `rgba(255,255,255,0.8)` | Simulated glass border |
| Green tint bg | `rgba(34,197,94,0.08)` | Streak strip background |
| Green tint border | `rgba(34,197,94,0.18)` | Streak strip border |

### Typography
| Element | Size | Weight | Case | Color |
|---------|------|--------|------|-------|
| Logo text | 44px | 800 | Title | #111827 |
| Logo chevron | 44px | 900 | — | #22C55E |
| Username | 28px | 700 | lowercase | #111827 |
| Stat label | 16px | 600 | UPPER | #9CA3AF |
| Stat value | 36px | 900 | — | #111827 |
| Workout type eyebrow | 24px | 700 | UPPER | #9CA3AF |
| COMPLETED headline | 80px | 900 | UPPER | #111827 |
| Stats value | 52px | 900 | — | #111827 |
| Stats label | 18px | 600 | UPPER | #9CA3AF |
| Streak number | 56px | 900 | — | #22C55E |
| Streak label | 36px | 700 | UPPER | #374151 |
| Footer | 24px | 600 | — | #9CA3AF |

### Glassmorphism simulation (Satori-compatible)
Satori doesn't support `backdrop-filter: blur()`. Glassmorphism is simulated:
- Background: `rgba(255,255,255,0.95)` — near-opaque white
- Border: `1px solid rgba(255,255,255,0.85)`
- Shadow: `0 8px 48px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)`
- The card floats against the photo/gradient hero creating a layered depth effect

### Plant visual treatment
The streak plant is represented by an emoji at the correct evolution tier, rendered at 160px with:
- A radial green glow circle behind it (300×300px, `rgba(34,197,94,0.3)`)
- A secondary glow (200×200px, `rgba(34,197,94,0.15)`)
- The emoji rendered at 160px font-size for maximum visual impact

### Workout photo treatment
- Full-width, object-cover fill of the hero zone
- Bottom 55% overlaid with a gradient: `linear-gradient(to bottom, transparent 0%, rgba(240,240,238,0.85) 70%, rgba(240,240,238,1) 100%)`
- This creates a cinematic depth-of-field feel, merging the photo into the card background
- The top portion of the photo (where the action is) shows clearly

---

## 6. STORY TEMPLATES (Phase 1)

All Phase 1 cards use one layout template with data-driven variations.

### Template 1: Workout Completed (daily)
- Headline: "COMPLETED"
- Eyebrow: Workout type (GYM DAY / RUN / RIDE / etc.)
- Stats: Streak count + plant level + (personal best if applicable)
- Strip: streak progress

### Template 2: Streak Milestone (triggered on milestone days)
Milestone days: 7, 14, 30, 50, 100, 200, 365
- Headline: "X DAYS" (larger, fills more space)
- Eyebrow: "STREAK MILESTONE"
- Badge: milestone badge (special icon for each milestone)
- Strip: "Keep going" message

### Template 3: Plant Evolution (triggered when plant level increases)
- Headline: "{NEW EMOJI} EVOLVED" 
- Eyebrow: "STREAK PLANT"
- Large: old emoji → new emoji with arrow
- Strip: "{oldName} → {newName}"

> **Phase 1 ships Template 1 only.** Templates 2 and 3 are designed but not yet implemented.

---

## 7. SHAREABLE MOMENTS CATALOG

| Moment | Template | Trigger condition | Priority |
|--------|----------|-------------------|----------|
| Daily workout completed | Template 1 | `post.status === VERIFIED` | P0 — ships now |
| New personal best streak | Template 1 (variant) | `streak.current === streak.best && current > 1` | P0 — included in Template 1 |
| 7-day streak | Template 2 | `streak.current === 7` | P1 — Phase 1.1 |
| 30-day streak | Template 2 | `streak.current === 30` | P1 — Phase 1.1 |
| Plant evolution | Template 3 | `previous_level !== current_level` | P1 — Phase 1.1 |
| 100-day streak | Template 2 (special) | `streak.current === 100` | P2 |
| 365-day streak | Template 2 (legendary) | `streak.current === 365` | P2 |

---

## 8. ANALYTICS EVENTS

All story sharing events should be tracked via the existing event system.

### Events to add
```typescript
STORY_GENERATED = 'STORY_GENERATED'       // card render completed
STORY_SHARE_TAPPED = 'STORY_SHARE_TAPPED' // user tapped the share button
STORY_SHARED = 'STORY_SHARED'             // navigator.share() resolved successfully
STORY_DOWNLOADED = 'STORY_DOWNLOADED'     // fallback download triggered
```

### Event payloads
```typescript
// STORY_GENERATED
{
  postId: string
  template: 'WORKOUT_COMPLETED' | 'STREAK_MILESTONE' | 'PLANT_EVOLUTION'
  streakCount: number
  plantLevel: number
  isPersonalBest: boolean
  workoutType: string
  generationMs: number
}

// STORY_SHARE_TAPPED / STORY_SHARED / STORY_DOWNLOADED
{
  postId: string
  shareMethod: 'web_share_api' | 'download_fallback'
}
```

> **Phase 1 note:** Analytics events are documented here but not wired. Wire in Phase 1.1 alongside Template 2/3 rollout.

---

## 9. PHASE 1 IMPLEMENTATION PLAN

### Files created
| File | Purpose |
|------|---------|
| `app/web/app/api/stories/generate/route.ts` | Server-side card generation (ImageResponse) |
| `app/web/components/features/StoryShareButton.tsx` | Client share button component |

### Files modified
| File | Change |
|------|--------|
| `app/web/app/(main)/upload/page.tsx` | Replace basic `shareWorkout()` with `<StoryShareButton>` |

### Component interface
```typescript
interface StoryShareButtonProps {
  postId: string
  streakCount: number | null
  workoutType: string | undefined
  isPersonalBest: boolean
}
```

### Definition of done (Phase 1)
- [ ] `GET /api/stories/generate?postId=X` returns a 1080×1920 PNG
- [ ] Only the post owner can generate a card (403 for others)
- [ ] Only VERIFIED posts can generate cards (404 for PENDING/REJECTED)
- [ ] Web Share API opens native share sheet on mobile with the image
- [ ] Download fallback works on desktop
- [ ] Loading state shown while card generates
- [ ] Card visually matches the design spec above at 90%+ fidelity

---

## 10. RISK ANALYSIS

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| R2 image unreachable at card generation time | Low | Medium | Satori falls back gracefully; render card with colored background |
| Satori render timeout (>10s Vercel limit) | Very low | High | Image renders in ~200ms; no concern for MVP |
| Web Share API unavailable (desktop) | Medium | Low | Download fallback always provided |
| Instagram doesn't accept shared PNG | Low | High | PNG is native format; Web Share API passes files correctly |
| User's workout photo too dark/light | Medium | Low | Gradient overlay normalizes almost any photo |
| Font loading adds latency | Low | Low | Fonts cached by Vercel edge; ~50ms first load |

---

## 11. PHASE 2 — ANIMATED STORY CARDS (FUTURE, DO NOT BUILD)

### Vision
Static cards are shareable. Animated cards go viral.

### Proposed stack
- **Lottie animations** for plant growth/evolution sequences (JSON, ~50KB per animation)
- **Canvas-based client rendering** for animated card assembly
- **MP4 export** via `MediaRecorder` API (records canvas animation to video)
- **Animated PNG (APNG)** as a lighter alternative

### Animations to create
| Animation | Duration | Trigger |
|-----------|----------|---------|
| Plant breathe (idle) | 3s loop | Always on plant |
| Streak counter counting up | 1.2s | Card entrance |
| Card slide-in from bottom | 0.6s | On generate |
| Confetti burst | 1.5s | Personal best |
| Plant evolution sequence | 3s | Level up |
| Background parallax | 0.8s | On share tap |

### Technical considerations
- `MediaRecorder` is supported in Chrome, Firefox, Safari 15.4+
- Canvas-to-MP4 requires H.264 codec — test cross-browser
- Animated Lottie files need a player library (`lottie-web` ~150KB)
- Phase 2 adds ~250KB to the bundle — only load on the share flow

---

## 12. PHASE 3 — BEACTIVE WRAPPED (FUTURE, DO NOT BUILD)

### Vision
Annual recap. BeActive Wrapped surfaces a user's entire year of workout data into a multi-slide story sequence — delivered every January 1st or on their signup anniversary.

### Slides
1. **Year intro**: "Your 2026 in BeActive"
2. **Total workouts**: Large number reveal
3. **Best streak**: "Your longest streak was X days"
4. **Plant journey**: Timeline of plant evolution throughout the year
5. **Consistency**: "You worked out X% of days"
6. **Best month**: Heatmap of most active month
7. **Achievements unlocked**: Badge wall
8. **Year-end plant**: Current plant state with year summary

### Technical considerations
- Requires aggregate query across all posts for the user (365-day window)
- Multi-slide requires a swipe-based story viewer
- Consider pre-generating Wrapped cards server-side (cron job December 31st)
- Each slide is a separate 1080×1920 PNG
- Total data per user: 8 slides × ~150KB = ~1.2MB — acceptable for annual event
- Store generated slides in R2 with TTL: `wrapped/{userId}/2026/{slide}.png`

### Trigger
Generate on-demand (user taps "See your Wrapped") OR pre-generate for all active users on Dec 31st.

---

## 13. IMPLEMENTATION NOTES

### Why `next/og` (Satori) over canvas
| Approach | Pros | Cons |
|----------|------|------|
| `next/og` (server) | Zero client JS, consistent across devices, works without canvas API | No CSS blur, limited CSS subset |
| Client canvas | Full CSS, animations possible | Heavy JS, device-dependent rendering, slower |
| `html2canvas` | Captures real DOM | Very slow, inconsistent, many known bugs |
| Puppeteer | Full browser rendering | ~2s latency, expensive on serverless |

`next/og` wins for Phase 1: fast, serverless-compatible, zero dependencies.

### Satori CSS limitations and workarounds
| Feature | Limitation | Workaround |
|---------|-----------|------------|
| `backdrop-filter` | Not supported | Semi-transparent white backgrounds |
| `filter: blur()` | Not supported | Gradient overlays for depth effect |
| `grid` layout | Not supported | Nested flex containers |
| `clip-path` | Limited | Border-radius for shapes |
| `transform` | Supported (translate, scale, rotate) | Use normally |
| Web fonts | Must load explicitly | Fetch from Google Fonts CDN |

### Font loading in Satori
```typescript
const fontRes = await fetch(
  'https://fonts.gstatic.com/s/plusjakartasans/v8/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_qU79TR.woff'
)
const fontData = await fontRes.arrayBuffer()
// Pass to ImageResponse options.fonts
```

### Web Share API file support detection
```typescript
const canShareFiles = typeof navigator !== 'undefined' 
  && 'share' in navigator 
  && 'canShare' in navigator
  && navigator.canShare({ files: [new File([''], 'test.png', { type: 'image/png' })] })
```
