# AGENT_RUNBOOK.md — BeActive AI Agent Execution Protocol v2.0

> **Purpose:** Deterministic execution protocol for AI agents. Not documentation — an operating system.

---

## 1. SYSTEM MODEL

BeActive is an **AI-orchestrated modular monolith with vertical-slice enforcement**.

Agents execute within strict contracts. They do not design architecture (Architect Agent does that). They implement, test, and deploy within defined boundaries.

---

## 2. AGENT HIERARCHY

### Architect Agent (AUTHORITY)
- Defines module boundaries, API contracts, DB schema
- Approves all structural changes
- Updates architecture.md, data_model.md
- NEVER writes implementation code

### Backend Agent (SERVER)
- Implements `/server/modules/*`
- Writes: services, repos, controllers, schemas
- Emits events, calls rule engine, respects state machines
- NEVER touches frontend, NEVER bypasses auth

### Frontend Agent (UI)
- Implements `/apps/web/*`
- Builds pages, components, hooks
- Consumes APIs only — NEVER direct DB access
- MUST handle: loading, error, empty states

### QA Agent (TRUTH)
- End-to-end validation, edge cases, security checks
- Sole authority on PASS/FAIL
- Tests: auth flows, streak logic, data integrity, API contracts
- Reports: severity, reproduction steps, root cause

### DevOps Agent (DEPLOY)
- Environment configuration, CI/CD, deployment validation
- NEVER modifies application logic

---

## 3. EXECUTION LOOP (Every Feature)

```
1. ARCHITECT: Define module + API contracts + DB changes
2. BACKEND: Implement service → repo → controller → schema
3. FRONTEND: Build UI → API integration → state handling
4. QA: Test end-to-end → edge cases → security
5. DEVOPS: Deploy → validate → health check
6. QA: Final verdict → PASS or FAIL
   └── If FAIL → identify root cause → affected agent reruns → full revalidation
```

**Non-negotiable:** No agent stops at first working version. Iterate until production-grade.

---

## 4. FEATURE SPEC TEMPLATE (Required before any implementation)

Every feature MUST declare this before code is written:

```
FEATURE: [name]
MODULE: [/server/modules/X]
SLICE: [which vertical slice]

ENDPOINTS:
  - METHOD /path → request body → response

DB CHANGES:
  - New tables/columns/indexes

EVENTS EMITTED:
  - EVENT_NAME → payload shape

STATE TRANSITIONS:
  - StateMachine: STATE_A → STATE_B [trigger]

RULES TRIGGERED:
  - Rule ID: condition → action

AI INVOLVEMENT:
  - None / Classification input / Classification output

VALIDATION RULES:
  - Field: constraint

EDGE CASES:
  - Scenario → expected behavior

FAILURE MODES:
  - What can go wrong → how we handle it

DEFINITION OF DONE:
  - Specific testable criteria
```

---

## 5. CODING RULES

### MUST
- Validate ALL inputs with Zod (no exceptions)
- Use service-layer pattern (controller → service → repo)
- Emit events for every state change
- Check state machine validity before transitions
- Handle errors with structured AppError classes
- Log every event emission and state transition
- Write types for every API request/response
- Follow naming conventions in memory.md

### MUST NOT
- Hardcode secrets or credentials
- Bypass auth middleware
- Access DB from frontend code
- Put business logic in controllers
- Duplicate logic across modules
- Skip event emission for state changes
- Trust client-side validation alone
- Create tables/columns without architect approval
- Import from another module's repo (service-to-service only)

---

## 6. MODULE COMMUNICATION RULES

```
ALLOWED:
  controller → own service
  service → own repo
  service → other module's service (via import)
  service → core/events (emit events)
  service → core/rules (evaluate rules)
  service → core/state-machines (request transitions)

FORBIDDEN:
  controller → any repo directly
  service → other module's repo
  frontend → any repo
  frontend → any service directly
  repo → another repo
```

---

## 7. EVENT-DRIVEN CHECKLIST

Before completing any feature, verify:

- [ ] All state changes emit corresponding events
- [ ] Event type is registered in event catalog (architecture.md §7)
- [ ] Event payload includes all necessary data
- [ ] Events are stored in events table (append-only)
- [ ] Relevant rules in rule registry are triggered
- [ ] State machine transitions are validated before execution
- [ ] Async handlers (notifications, feed) are triggered by events

---

## 8. DEBUGGING PROTOCOL

When something fails, check in this order:
1. API contract — does request match schema?
2. Validation layer — is Zod rejecting valid input?
3. Auth middleware — is session valid?
4. Service layer — is business logic correct?
5. Rule engine — are conditions evaluating correctly?
6. State machine — is the transition valid from current state?
7. Repository — is the query correct?
8. Database — is the data in expected state?
9. Frontend — is state management correct?

No guessing. Verify each layer systematically.

---

## 9. DEFINITION OF DONE (Strict)

A feature is COMPLETE only when:
- [ ] Backend implemented and tested
- [ ] Frontend implemented and tested
- [ ] All events emitting correctly
- [ ] State machines transitioning correctly
- [ ] Zod validation on all endpoints
- [ ] Auth required on all protected routes
- [ ] Rate limiting on sensitive endpoints
- [ ] Error states handled in UI
- [ ] QA agent declares PASS
- [ ] Deployed to staging/production
- [ ] No security violations

---

## CORE PRINCIPLE

Design is centralized (Architect). Execution is distributed (agents). Verification is absolute (QA). Agents iterate until production is correct — they do not "try" and stop.
