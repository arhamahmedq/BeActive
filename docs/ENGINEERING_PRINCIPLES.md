# ENGINEERING_PRINCIPLES.md — BeActive Engineering Philosophy v2.0

> **Purpose:** The beliefs that drive every technical decision. When in doubt, consult this document.

---

## THE 10 PRINCIPLES

### 1. Events Are Truth
If it's not in the event log, it didn't happen. Every state change emits an immutable event. The event log is the system of record — everything else is a projection.

### 2. State Machines Are Law
No state change without a valid transition. User activity, workout verification, and streak lifecycle are all governed by formal state machines with explicitly defined valid/invalid transitions.

### 3. Rules Are Centralized
All business logic lives in the rule engine registry. No scattered if/else in controllers. No business logic in the frontend. No hidden decision-making in repos. One place to find every rule.

### 4. AI Is Read-Only
AI classifies. AI does not decide. AI never writes to the database. AI never triggers state transitions. AI output feeds into the rule engine as data, not as authority.

### 5. Simplicity Until Proven Otherwise
No microservices until proven bottleneck. No Kubernetes until proven need. No distributed queues until event throughput demands it. No caching until query performance requires it. Complexity is a cost, not a feature.

### 6. Vertical Slices Over Horizontal Layers
Build features end-to-end: DB → backend → frontend → tests → deploy. Never build "all the APIs" then "all the UI". Each slice is independently valuable and deployable.

### 7. Deterministic Behavior
Same events → same state, every time. No random behavior. No race conditions in business logic. No client-clock dependencies. UTC everywhere. Timestamps from server, never client.

### 8. Modules Are Isolated
Each module owns its data and exposes only services. Cross-module communication goes through service imports, never direct repo access. A module can be extracted to a service without changing its interface.

### 9. Beginner Readable
Any engineer (or AI agent) should understand any module within 10 minutes. Clear naming. Consistent structure. Documented decisions. No clever abstractions that obscure intent.

### 10. Production Mindset From Day One
Auth is real. Validation is real. Error handling is real. EXIF stripping is real. Rate limiting is real. No "we'll add security later." Security and correctness are not features — they're properties.

---

## DECISION FRAMEWORK

When making any technical decision, ask:

1. **Does this make the system simpler or more complex?** (prefer simpler)
2. **Can we defer this until we have evidence it's needed?** (prefer deferring)
3. **Is this documented?** (if not, document before implementing)
4. **Does this create coupling between modules?** (if yes, redesign)
5. **What happens when this fails?** (if unknown, define failure mode first)
6. **Can an AI agent understand this in 10 minutes?** (if not, simplify)

---

## WHAT WE VALUE vs. WHAT WE AVOID

| We Value | We Avoid |
|----------|----------|
| Deterministic behavior | Hidden side effects |
| Explicit contracts | Implicit assumptions |
| Centralized business logic | Scattered if/else |
| Immutable event logs | Mutable audit trails |
| Module isolation | Cross-module repo calls |
| Server-side validation | Client-side trust |
| Cursor-based pagination | Offset pagination |
| UTC timestamps | Local timezone calculations |
| Structured errors | Raw exception messages |
| Boring technology | Trendy frameworks |

---

## THE BEACTIVE STACK PRINCIPLE

We use boring, proven, well-documented technology. Our competitive advantage is product and execution, not infrastructure novelty. Next.js, PostgreSQL, Prisma, Tailwind — these are tools that work. We save creativity for the product, not the plumbing.
