# SECURITY.md — BeActive Security Policy v2.0

> **Synced with:** architecture.md, memory.md, agent_runbook.md

---

## 1. SECURITY MODEL

Defense-in-depth for a consumer social application. Production-minded from day 1, scaling security with product growth.

---

## 2. AUTHENTICATION

### Provider: Supabase Auth
- Email/password (MVP)
- OAuth providers: Google, Apple (post-MVP)
- Email verification required
- Password reset via email

### Session Model
- HTTP-only secure cookies (SameSite=Lax)
- Rotating refresh tokens (Supabase handles rotation)
- Short-lived access tokens (1 hour)
- Server-side session validation on every protected request
- Logout invalidates refresh token

### NEVER
- Store tokens in localStorage or sessionStorage
- Expose tokens to client-side JavaScript
- Trust client auth state without server verification
- Skip session validation on mutation endpoints

### Rate Limiting
- Login: 5 attempts per minute per IP
- Signup: 3 per minute per IP
- Password reset: 3 per hour per email

---

## 3. AUTHORIZATION (RBAC)

### Roles
| Role | Permissions |
|------|------------|
| USER | CRUD own posts, manage own profile, view friend feed, send messages |
| ADMIN | All USER permissions + ban users, moderate content, view analytics |

### Enforcement
- All authorization checks happen server-side in middleware
- Frontend role checks are for UX only — NEVER for security
- Admin routes require separate middleware with role validation
- No horizontal privilege escalation (user A cannot access user B's private data)

---

## 4. API SECURITY

### All endpoints must:
- Validate inputs with Zod schemas
- Enforce auth middleware (except /auth/signup, /auth/login)
- Return structured error responses (never raw DB errors)
- Include rate limiting
- Log request metadata (userId, endpoint, timestamp, response code)

### Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": []
  }
}
```

### NEVER expose in API responses:
- Password hashes
- Internal database IDs (use public-safe CUIDs)
- Stack traces
- SQL query details
- Other users' private data (email, etc.)

---

## 5. UPLOAD SECURITY

### Validation Pipeline
1. Client requests signed upload URL → server validates auth + rate limit
2. Server generates pre-signed R2 URL (expires 5 min, max 10MB)
3. Client uploads directly to R2
4. Client confirms upload → server validates:
   - File exists in R2
   - MIME type: image/jpeg, image/png, image/webp ONLY
   - File size ≤ 10MB
   - Extension matches MIME
5. Server strips EXIF metadata (GPS, device info, timestamps)
6. Server creates post record

### NEVER
- Trust client-provided MIME types as sole validation
- Allow executable files, SVGs, or HTML uploads
- Serve user uploads from same domain as app (use R2 CDN domain)
- Store user-controlled filenames (randomize with CUID)

### Rate Limiting
- Upload signing: 10 per hour per user
- Post creation: 5 per hour per user (enforces 1 verified per day at service layer)

---

## 6. DATA SECURITY

### Database
- All queries through Prisma ORM (parameterized by default)
- No raw SQL without explicit review
- No direct DB access from frontend
- Production DB access restricted to founder + deploy pipeline only

### Sensitive Fields
- `passwordHash`: managed by Supabase Auth, never in our schema
- `email`: never exposed in public API responses (only to own user)
- `imageKey`: internal only, never exposed to clients (expose `imageUrl` only)

### Data Deletion
- Deleted posts: hard delete from DB, delete image from R2
- Deleted accounts: cascade delete all user data, delete all media from R2
- Events table: events referencing deleted users retain anonymous data for audit

---

## 7. AI SECURITY BOUNDARY

### AI Agent Rules (Code Generation)
AI agents are FORBIDDEN from:
- Hardcoding any secrets or credentials
- Bypassing auth middleware on any route
- Disabling Zod validation
- Writing direct DB queries outside repo layer
- Modifying auth or RBAC systems without architect review
- Exposing admin routes without role middleware
- Committing .env files or secrets to git
- Creating debug endpoints that bypass security

### AI Classification Layer
- AI has ZERO write access to database
- AI receives only: image data + post ID
- AI returns only: classification payload
- AI output goes to rule engine — never directly to state machine
- AI cannot access: user data, streak data, friend data, session data

---

## 8. INFRASTRUCTURE SECURITY

### Environment Separation
| Environment | Database | Auth | Purpose |
|------------|----------|------|---------|
| dev | Local Docker Postgres | Supabase dev project | Development |
| staging | Supabase staging project | Supabase staging | Pre-production testing |
| production | Supabase production | Supabase production | Live users |

### Secrets Management
- All secrets in environment variables
- `.env` files NEVER committed (`.env.example` with placeholder values only)
- Vercel environment variables for production
- Supabase dashboard for database credentials
- Rotate API keys quarterly

### Required Secrets
```
DATABASE_URL          # Supabase Postgres connection string
SUPABASE_URL          # Supabase project URL
SUPABASE_ANON_KEY     # Supabase public key (safe for client)
SUPABASE_SERVICE_KEY   # Supabase service key (server-only, NEVER expose)
R2_ACCESS_KEY_ID      # Cloudflare R2 access key
R2_SECRET_ACCESS_KEY  # Cloudflare R2 secret key
R2_BUCKET_NAME        # R2 bucket name
R2_PUBLIC_URL         # R2 CDN URL for serving images
AI_API_KEY            # OpenAI/Anthropic API key for workout classification
```

---

## 9. LOGGING & MONITORING

### Must Log
- All auth events (signup, login, logout, failed attempts)
- All state machine transitions
- All event emissions
- API errors (4xx and 5xx)
- Upload attempts (success/failure)
- AI classification results
- Rate limit triggers

### NEVER Log
- Passwords or password hashes
- Full auth tokens
- Credit card details (not applicable MVP)
- Full request bodies containing sensitive data

### Tools (MVP)
- Structured JSON logging (console in dev, Vercel logs in prod)
- Sentry for error tracking (free tier)
- Vercel Analytics for basic metrics

---

## 10. DEPLOYMENT SECURITY

- Protected `main` branch (no direct push)
- All changes via pull request (even solo founder)
- Vercel auto-deploys on merge to main
- Preview deployments for feature branches
- Database migrations reviewed before merge
- No manual production DB access (use migrations only)

---

## 11. FUTURE SECURITY ROADMAP

| Phase | Addition |
|-------|---------|
| Post-MVP | Web push notification security (service worker) |
| Growth | Admin MFA, audit logging dashboard |
| Scale | WAF (Cloudflare), DDoS protection, SOC 2 prep |
| Platform | Content moderation (NSFW detection), bot prevention |

---

## CORE PRINCIPLE

Security is not a feature — it's a property of every feature. Every endpoint, every upload, every state change must be secure by default.
