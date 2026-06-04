# API_CONTRACTS.md — BeActive API Reference v2.0

> **Purpose:** Every endpoint, every request shape, every response shape. The contract between frontend and backend.

---

## GLOBAL RULES

- All endpoints return JSON
- All mutation endpoints require authentication (except signup/login)
- All inputs validated with Zod schemas
- All errors follow the standard error format
- Cursor-based pagination on all list endpoints
- Rate limiting on all endpoints

### Standard Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [{ "field": "email", "message": "Required" }]
  }
}
```

### Error Codes
| Code | HTTP Status | Meaning |
|------|-------------|---------|
| VALIDATION_ERROR | 400 | Input failed Zod validation |
| UNAUTHORIZED | 401 | No valid session |
| FORBIDDEN | 403 | Authenticated but no permission |
| NOT_FOUND | 404 | Resource doesn't exist |
| CONFLICT | 409 | Duplicate resource (e.g. duplicate friend request) |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Unexpected server error (never expose details) |

---

## AUTH ENDPOINTS

### POST /api/auth/signup
```
Auth: None
Rate limit: 3/min per IP

Request:
{
  "email": "string (valid email, required)",
  "username": "string (3-20 chars, alphanumeric + underscore, required)",
  "password": "string (8+ chars, required)"
}

Response 201:
{
  "user": { "id", "email", "username", "createdAt" },
  "session": { "expiresAt" }
}

Errors: VALIDATION_ERROR, CONFLICT (email/username taken)
Events: USER_SIGNED_UP
```

### POST /api/auth/login
```
Auth: None
Rate limit: 5/min per IP

Request:
{
  "email": "string (required)",
  "password": "string (required)"
}

Response 200:
{
  "user": { "id", "email", "username" },
  "session": { "expiresAt" }
}

Errors: UNAUTHORIZED (invalid credentials)
Events: USER_LOGGED_IN
```

### POST /api/auth/logout
```
Auth: Required
Response 200: { "success": true }
Events: USER_LOGGED_OUT
```

### GET /api/auth/session
```
Auth: Required
Response 200: { "user": { "id", "email", "username", "activityState" } }
Response 401: UNAUTHORIZED
```

---

## UPLOAD ENDPOINTS

### POST /api/uploads/sign
```
Auth: Required
Rate limit: 10/hour per user

Request:
{
  "mimeType": "string (image/jpeg | image/png | image/webp)",
  "fileSize": "number (max 10485760 = 10MB)"
}

Response 200:
{
  "uploadUrl": "string (pre-signed R2 URL, expires 5 min)",
  "key": "string (random CUID filename)"
}

Errors: VALIDATION_ERROR (invalid MIME or size)
```

---

## POST ENDPOINTS

### POST /api/posts/create
```
Auth: Required
Rate limit: 5/hour per user

Request:
{
  "imageKey": "string (R2 key from upload step, required)",
  "caption": "string (optional, max 500 chars)"
}

Response 201:
{
  "post": { "id", "imageUrl", "caption", "status": "PENDING", "createdAt" }
}

Errors: VALIDATION_ERROR, CONFLICT (already posted today)
Events: WORKOUT_UPLOADED
```

### GET /api/posts/:id
```
Auth: Required
Response 200:
{
  "post": {
    "id", "imageUrl", "caption", "status", "createdAt",
    "user": { "id", "username", "avatarUrl" },
    "workout": { "type", "confidence" } | null
  }
}
Errors: NOT_FOUND
```

---

## FEED ENDPOINTS

### GET /api/feed
```
Auth: Required
Query: ?cursor=string&limit=number(default 20, max 50)

Response 200:
{
  "posts": [
    {
      "id", "imageUrl", "caption", "createdAt",
      "user": { "id", "username", "avatarUrl", "streak": { "current" } },
      "workout": { "type" }
    }
  ],
  "nextCursor": "string | null"
}
```

---

## STREAK ENDPOINTS

### GET /api/streaks/me
```
Auth: Required
Response 200:
{
  "current": 15,
  "best": 30,
  "status": "ACTIVE",
  "lastVerifiedAt": "2025-01-15T10:00:00Z"
}
```

### GET /api/streaks/:userId
```
Auth: Required
Response 200:
{
  "current": 15,
  "best": 30,
  "status": "ACTIVE"
}
Errors: NOT_FOUND
```

---

## FRIEND ENDPOINTS

### POST /api/friends/request
```
Auth: Required
Request: { "targetUserId": "string" }
Response 201: { "friendship": { "id", "status": "PENDING" } }
Errors: CONFLICT (already exists), VALIDATION_ERROR
Events: FRIEND_REQUEST_SENT
```

### POST /api/friends/accept
```
Auth: Required
Request: { "friendshipId": "string" }
Response 200: { "friendship": { "id", "status": "ACCEPTED" } }
Errors: NOT_FOUND, FORBIDDEN (not the recipient)
Events: FRIEND_REQUEST_ACCEPTED
```

### POST /api/friends/reject
```
Auth: Required
Request: { "friendshipId": "string" }
Response 200: { "success": true }
Errors: NOT_FOUND, FORBIDDEN
```

### POST /api/friends/remove
```
Auth: Required
Request: { "friendshipId": "string" }
Response 200: { "success": true }
Errors: NOT_FOUND (missing, or a BLOCKED row — remove never unblocks), FORBIDDEN (non-participant; recipient cancelling a PENDING request must use reject)
Events: FRIEND_REMOVED (ACCEPTED only; cancelling a PENDING request is silent)
```

### POST /api/friends/cancel
```
Auth: Required
Request: { "friendshipId": "string" }
Response 200: { "success": true }
Errors: NOT_FOUND, FORBIDDEN (only the requester/userAId), CONFLICT (no longer PENDING — never deletes an accepted friendship)
```

### POST /api/friends/block
```
Auth: Required
Request: { "targetUserId": "string" }
Response 200: { "friendship": { "id", "status": "BLOCKED" } }   # idempotent on a concurrent duplicate block
Errors: CONFLICT (self-block), NOT_FOUND (target user), VALIDATION_ERROR
Events: USER_BLOCKED
```

### POST /api/friends/unblock
```
Auth: Required
Request: { "targetUserId": "string" }
Response 200: { "success": true }
Errors: CONFLICT (self-unblock), NOT_FOUND (caller has no block on target), VALIDATION_ERROR
Events: USER_UNBLOCKED
```

### GET /api/friends
```
Auth: Required
Response 200:
{
  "friends": [
    { "id", "friendshipId", "username", "displayName", "avatarUrl", "streak": { "current" } }
  ]
}
```

### GET /api/friends/pending
```
Auth: Required
Response 200:
{
  "incoming": [{ "friendshipId", "user": { "id", "username", "avatarUrl" } }],
  "outgoing": [{ "friendshipId", "user": { "id", "username", "avatarUrl" } }]
}
```

### GET /api/users/search
```
Auth: Required
Query: ?q=string (min 2 chars)
Response 200: { "users": [{ "id", "username", "avatarUrl" }] }
```

---

## NOTIFICATION ENDPOINTS

### GET /api/notifications
```
Auth: Required
Query: ?cursor=string&limit=number(default 20)
Response 200:
{
  "notifications": [
    { "id", "type", "title", "body", "data", "read", "createdAt" }
  ],
  "unreadCount": 5,
  "nextCursor": "string | null"
}
```

### POST /api/notifications/read
```
Auth: Required
Request: { "notificationIds": ["string"] }
Response 200: { "success": true }
```

---

## PROFILE ENDPOINTS

### GET /api/users/me
```
Auth: Required
Response 200:
{
  "user": { "id", "email", "username", "displayName", "avatarUrl", "bio", "timezone", "createdAt" }
}
```

### PATCH /api/users/me
```
Auth: Required
Request: { "displayName?", "bio?", "timezone?", "avatarUrl?" }
Response 200: { "user": { ...updated fields } }
```
