/**
 * beactive-dispatch — pure deterministic core.
 *
 * No I/O, no fs, no process, no network. Every function is a pure transformation
 * so it is fully unit-testable and gives the (prose) kernel a single canonical,
 * machine-checked definition of:
 *   - the task frontmatter contract
 *   - valid task-state transitions
 *   - deterministic task selection (ordering)
 *   - stale-lock / crash detection
 *   - task-id uniqueness
 *
 * The /process-dispatch kernel and CONTRACT.md MUST agree with this file.
 * If prose and this file disagree, this file is the tiebreaker for mechanics.
 */

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked'
export type Priority = 'high' | 'medium' | 'low'

export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
export const TERMINAL_STATES: readonly TaskStatus[] = ['done', 'failed', 'blocked']
export const DEFAULT_LOCK_TTL_MS = 60 * 60 * 1000 // 1 hour

const VALID_STATUS = new Set<string>(['pending', 'running', 'done', 'failed', 'blocked'])
const VALID_PRIORITY = new Set<string>(['high', 'medium', 'low'])
const VALID_EFFORT = new Set<string>(['low', 'medium', 'high'])

const REQUIRED_FIELDS = ['id', 'source', 'status', 'priority', 'model_effort', 'created_at', 'slice'] as const

/**
 * Deterministic task-state machine. A task may only move along these edges.
 * Terminal states have no outgoing edges. `running -> pending` exists solely for
 * stale-lock / crash recovery (re-queue an orphaned task).
 */
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ['running'],
  running: ['done', 'failed', 'blocked', 'pending'],
  done: [],
  failed: [],
  blocked: [],
}

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(status)
}

export function canTransition(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from as TaskStatus]
  return allowed ? (allowed as readonly string[]).includes(to) : false
}

export interface ParsedTask {
  meta: Record<string, string>
  body: string
}

/**
 * Parse a dispatch task markdown file (flat `key: value` frontmatter between
 * `---` fences). Tolerant: a file with no frontmatter yields empty meta + body.
 */
export function parseTaskFile(raw: string): ParsedTask {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw.trim() }
  const meta: Record<string, string> = {}
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (key) meta[key] = val
  }
  return { meta, body: (m[2] ?? '').trim() }
}

/** Returns a list of human-readable validation errors. Empty array = valid. */
export function validateTaskMeta(meta: Record<string, string>): string[] {
  const errors: string[] = []
  for (const k of REQUIRED_FIELDS) {
    if (!meta[k]) errors.push(`missing required field: ${k}`)
  }
  if (meta.status && !VALID_STATUS.has(meta.status)) errors.push(`invalid status: ${meta.status}`)
  if (meta.priority && !VALID_PRIORITY.has(meta.priority)) errors.push(`invalid priority: ${meta.priority}`)
  if (meta.model_effort && !VALID_EFFORT.has(meta.model_effort)) {
    errors.push(`invalid model_effort: ${meta.model_effort}`)
  }
  if (meta.created_at && Number.isNaN(Date.parse(meta.created_at))) {
    errors.push(`invalid created_at (not ISO-8601): ${meta.created_at}`)
  }
  return errors
}

/**
 * Deterministic single-task selection. Total order:
 *   1. status precedence: running (orphaned, recover first) before pending
 *   2. priority: high > medium > low
 *   3. created_at ascending (FIFO within a tier)
 *   4. id ascending (final tiebreak — guarantees a stable, unique winner)
 * Terminal tasks are ignored. Returns null when nothing is actionable (idle).
 */
export function selectNextTask(
  tasks: ReadonlyArray<Record<string, string>>,
): Record<string, string> | null {
  const actionable = tasks.filter((t) => t.status === 'running' || t.status === 'pending')
  if (actionable.length === 0) return null
  const statusRank = (s: string): number => (s === 'running' ? 0 : 1)
  const sorted = [...actionable].sort((a, b) => {
    const sr = statusRank(a.status ?? '') - statusRank(b.status ?? '')
    if (sr !== 0) return sr
    const pr =
      (PRIORITY_RANK[a.priority as Priority] ?? 99) - (PRIORITY_RANK[b.priority as Priority] ?? 99)
    if (pr !== 0) return pr
    const ca = Date.parse(a.created_at ?? '') || 0
    const cb = Date.parse(b.created_at ?? '') || 0
    if (ca !== cb) return ca - cb
    return (a.id ?? '').localeCompare(b.id ?? '')
  })
  return sorted[0] ?? null
}

/**
 * A `running` task is a stale lock (crashed/orphaned prior cycle) when:
 *   - it has no `locked_at` timestamp (legacy/forced running), OR
 *   - `locked_at` is unparseable, OR
 *   - `locked_at` is older than ttlMs.
 * Non-running tasks are never stale locks.
 */
export function isStaleLock(
  meta: Record<string, string>,
  nowMs: number,
  ttlMs: number = DEFAULT_LOCK_TTL_MS,
): boolean {
  if (meta.status !== 'running') return false
  if (!meta.locked_at) return true
  const lockedMs = Date.parse(meta.locked_at)
  if (Number.isNaN(lockedMs)) return true
  return nowMs - lockedMs > ttlMs
}

/** Returns the set of ids that appear more than once (empty = all unique). */
export function findDuplicateIds(ids: ReadonlyArray<string>): string[] {
  const seen = new Set<string>()
  const dups = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dups.add(id)
    else seen.add(id)
  }
  return [...dups]
}
