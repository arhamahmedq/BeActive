# CONTEXT.md — BeActive Company & Product Context v2.0

> **Purpose:** Strategic context for all engineering decisions. Every technical choice must trace back to this document.

---

## 1. COMPANY IDENTITY

**Name:** BeActive
**Type:** AI-native consumer startup
**Stage:** Pre-seed / MVP build
**Team:** Solo founder + AI-assisted engineering (Claude/Codex agents)
**Platform:** Web-first (Next.js), mobile later (React Native)

---

## 2. MISSION

Help people build consistent physical activity habits by making daily movement social, streak-driven, and emotionally engaging.

**One-liner for investors:** "BeActive is where Strava meets BeReal — daily workout proof, social accountability, streak-powered retention."

---

## 3. THE GAP WE FILL

| Platform | Strength | Weakness (our opportunity) |
|----------|----------|---------------------------|
| Strava | Deep analytics, endurance athletes, GPS routes | Niche audience, no daily engagement hook, intimidating for beginners, low social accountability |
| BeReal | Daily authentic posting, streak mechanic | No fitness focus, engagement drops after novelty fades |
| Instagram | Stories, feed, social graph | No fitness accountability, curated not authentic |
| TikTok | Streaks, engagement loops | Entertainment-first, no health outcomes |

**BeActive combines:**
- **BeReal:** Daily photo proof mechanic (authenticity)
- **Instagram:** Stories + social feed (discovery + engagement)
- **TikTok/Snapchat:** Streaks as retention hooks (habit formation)
- **Strava:** Activity logging + fitness identity (purpose)

**Core insight:** Strava serves serious athletes. Gen Z and casual fitness users need social accountability, not performance analytics. There's no app that makes working out a daily social habit with real consequences (broken streaks) and real rewards (social visibility).

---

## 4. PRODUCT CONCEPT

### Core Loop (The Habit Engine)

```
1. User gets daily reminder (notification)
2. User works out (any activity)
3. User takes photo proof
4. AI verifies it's a real workout
5. Streak increments
6. Post appears in friends' feed + story
7. Friends react / send snaps
8. Social pressure + streak fear → user returns tomorrow
```

### Key Product Features (MVP)

| Feature | Inspiration | Purpose |
|---------|------------|---------|
| Daily workout photo | BeReal | Authentic daily engagement |
| Streak system | Snapchat/TikTok | Retention through loss aversion |
| Social feed | Instagram | Discovery + social proof |
| Stories (24h) | Instagram | Ephemeral urgency |
| Friend snaps/DMs | Snapchat | Accountability pairs |
| AI workout verification | Novel | Prevents fake posts, trust in streaks |
| Activity types | Strava (simplified) | "I did gym / running / cycling" without GPS complexity |

### What We Intentionally Do NOT Build (MVP)

- GPS route tracking
- Detailed workout metrics (reps, sets, pace)
- Leaderboards or competitive ranking
- Workout plans or coaching
- Calorie tracking
- Wearable device integration
- Video uploads (photos only MVP)

These may be added post-PMF based on user demand.

---

## 5. TARGET USERS

**Primary:** Gen Z and young millennials (16-28) who want to be more active but struggle with consistency.

**Personas:**
- **The Gym Beginner:** Goes 2x/week, wants to go daily, needs motivation
- **The Accountability Seeker:** Has gym friends but no way to track together
- **The Strava Dropout:** Tried Strava, too complex, not social enough
- **The Social Fitness User:** Posts gym selfies on Instagram stories — wants a dedicated space

**User acquisition hypothesis:** Friends invite friends for streaks (viral loop through accountability pairs).

---

## 6. ENGAGEMENT STRATEGY

### Retention Levers
1. **Loss aversion:** Breaking a 30-day streak feels painful
2. **Social proof:** Seeing friends post daily normalizes the behavior
3. **Accountability pairs:** DM streaks with specific friends
4. **Status signaling:** High streak count visible on profile
5. **Story urgency:** 24h ephemeral content creates FOMO

### Notification Strategy
- T+20h: "Your streak is at risk! Post a workout to keep it alive"
- T+23h: "Last chance! Your 15-day streak expires in 1 hour"
- Friend posted: "Sarah just posted her workout — keep up!"
- Friend request: "Alex wants to be your workout buddy"

### Anti-Addiction Commitment
- No infinite algorithmic scroll (friend-only feed)
- No public vanity metrics (no follower counts)
- Notifications are motivational, not manipulative
- Streak system encourages healthy daily activity, not compulsive app usage
- One post per day maximum (no content treadmill)

---

## 7. BUSINESS MODEL (FUTURE — NOT MVP)

Potential monetization (post-PMF):
- **Premium:** Extended streak freeze (miss 1 day without breaking), advanced stats, custom themes
- **Brand partnerships:** Gym chains, fitness brands, supplement companies
- **Challenges:** Sponsored 30-day challenges

MVP is free. Monetization decisions deferred until product-market fit confirmed.

---

## 8. SUCCESS METRICS

### MVP Success (First 3 months)
- 500+ registered users
- 30%+ D7 retention
- Average streak length > 5 days
- 3+ posts per user per week
- Organic friend invites happening

### Growth Success (6-12 months)
- 100k+ users
- 40%+ D30 retention
- Viral coefficient > 1.0 (each user brings >1 new user)
- Average streak > 14 days

---

## 9. COMPETITIVE MOAT

1. **Network effects:** More friends → more accountability → harder to leave
2. **Streak lock-in:** Long streaks create switching cost
3. **AI verification:** Trust in streaks (can't fake it) differentiates from honor-system apps
4. **Data advantage:** Workout patterns enable future personalization

---

## 10. LONG-TERM VISION

| Stage | Focus |
|-------|-------|
| Stage 1 (Now) | MVP: streak + upload + feed + notifications |
| Stage 2 | Social graph expansion, DMs, friend discovery |
| Stage 3 | AI coaching, personalized challenges, premium tier |
| Stage 4 | Platform: brand partnerships, fitness creator tools |
| Stage 5 | Global fitness social network, potential acquisition target |

---

## 11. DEVELOPMENT PHILOSOPHY

- **Web-first:** Ship faster, validate faster, mobile comes after PMF
- **AI-native:** Claude/Codex as engineering agents, not just assistants
- **Vertical slices:** Each feature shipped end-to-end before starting next
- **Modular monolith:** Simple to deploy, easy to understand, extractable later
- **Event-driven core:** Deterministic behavior, replayable, auditable

---

## 12. CORE PRINCIPLE

We are not building a fitness tracker. We are building a **daily social habit engine** powered by streaks, social accountability, and AI-verified authenticity — designed for people who want to move more but need a reason to show up every day.
