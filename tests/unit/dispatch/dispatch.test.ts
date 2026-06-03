import { describe, it, expect } from 'vitest'
import {
  parseTaskFile,
  validateTaskMeta,
  canTransition,
  isTerminal,
  selectNextTask,
  isStaleLock,
  findDuplicateIds,
  outboxPath,
  renderOutbox,
  type OutboxReport,
  validateEnqueueInput,
  buildTaskFile,
  renderTaskFile,
  type EnqueueInput,
  DEFAULT_LOCK_TTL_MS,
  TERMINAL_STATES,
} from '../../../beactive-dispatch/lib/dispatch'

const goodMeta = {
  id: 'task-a',
  source: 'manual',
  status: 'pending',
  priority: 'high',
  model_effort: 'low',
  created_at: '2026-06-03T09:00:00Z',
  slice: 'none',
}

describe('parseTaskFile', () => {
  it('parses flat frontmatter + body', () => {
    const raw = `---\nid: x\nstatus: pending\npriority: low\n---\n\nDo the thing.`
    const { meta, body } = parseTaskFile(raw)
    expect(meta).toEqual({ id: 'x', status: 'pending', priority: 'low' })
    expect(body).toBe('Do the thing.')
  })

  it('tolerates a file with no frontmatter', () => {
    const { meta, body } = parseTaskFile('just a body')
    expect(meta).toEqual({})
    expect(body).toBe('just a body')
  })

  it('keeps colons in values intact', () => {
    const { meta } = parseTaskFile(`---\ncreated_at: 2026-06-03T09:00:00Z\n---\n`)
    expect(meta.created_at).toBe('2026-06-03T09:00:00Z')
  })
})

describe('validateTaskMeta', () => {
  it('accepts a fully-formed task', () => {
    expect(validateTaskMeta(goodMeta)).toEqual([])
  })

  it('flags each missing required field', () => {
    const errs = validateTaskMeta({})
    for (const f of ['id', 'source', 'status', 'priority', 'model_effort', 'created_at', 'slice']) {
      expect(errs).toContain(`missing required field: ${f}`)
    }
  })

  it('rejects invalid enums', () => {
    const errs = validateTaskMeta({ ...goodMeta, status: 'sideways', priority: 'urgent', model_effort: 'max' })
    expect(errs).toContain('invalid status: sideways')
    expect(errs).toContain('invalid priority: urgent')
    expect(errs).toContain('invalid model_effort: max')
  })

  it('rejects a non-ISO created_at', () => {
    expect(validateTaskMeta({ ...goodMeta, created_at: 'yesterday' })).toContain(
      'invalid created_at (not ISO-8601): yesterday',
    )
  })
})

describe('canTransition / isTerminal', () => {
  it('allows the legal edges', () => {
    expect(canTransition('pending', 'running')).toBe(true)
    expect(canTransition('running', 'done')).toBe(true)
    expect(canTransition('running', 'failed')).toBe(true)
    expect(canTransition('running', 'blocked')).toBe(true)
    expect(canTransition('running', 'pending')).toBe(true) // recovery re-queue
  })

  it('forbids illegal edges', () => {
    expect(canTransition('pending', 'done')).toBe(false) // must pass through running
    expect(canTransition('done', 'running')).toBe(false) // terminal
    expect(canTransition('failed', 'pending')).toBe(false)
    expect(canTransition('blocked', 'running')).toBe(false)
    expect(canTransition('bogus', 'running')).toBe(false)
  })

  it('identifies terminal states', () => {
    expect(TERMINAL_STATES).toEqual(['done', 'failed', 'blocked'])
    expect(isTerminal('done')).toBe(true)
    expect(isTerminal('running')).toBe(false)
  })
})

describe('selectNextTask (deterministic ordering)', () => {
  it('returns null when nothing is actionable', () => {
    expect(selectNextTask([])).toBeNull()
    expect(selectNextTask([{ ...goodMeta, status: 'done' }])).toBeNull()
  })

  it('recovers an orphaned running task before any pending', () => {
    const picked = selectNextTask([
      { ...goodMeta, id: 'pending-high', status: 'pending', priority: 'high' },
      { ...goodMeta, id: 'orphan', status: 'running', priority: 'low' },
    ])
    expect(picked?.id).toBe('orphan')
  })

  it('prefers higher priority among pending', () => {
    const picked = selectNextTask([
      { ...goodMeta, id: 'lo', priority: 'low' },
      { ...goodMeta, id: 'hi', priority: 'high' },
      { ...goodMeta, id: 'mid', priority: 'medium' },
    ])
    expect(picked?.id).toBe('hi')
  })

  it('breaks priority ties by created_at (FIFO)', () => {
    const picked = selectNextTask([
      { ...goodMeta, id: 'newer', created_at: '2026-06-03T10:00:00Z' },
      { ...goodMeta, id: 'older', created_at: '2026-06-03T08:00:00Z' },
    ])
    expect(picked?.id).toBe('older')
  })

  it('breaks created_at ties by id for total determinism', () => {
    const picked = selectNextTask([
      { ...goodMeta, id: 'bbb' },
      { ...goodMeta, id: 'aaa' },
    ])
    expect(picked?.id).toBe('aaa')
  })
})

describe('isStaleLock (crash / stale-lock recovery)', () => {
  const now = Date.parse('2026-06-03T12:00:00Z')

  it('is false for non-running tasks', () => {
    expect(isStaleLock({ ...goodMeta, status: 'pending' }, now)).toBe(false)
    expect(isStaleLock({ ...goodMeta, status: 'done' }, now)).toBe(false)
  })

  it('treats a running task with no locked_at as stale (orphaned)', () => {
    expect(isStaleLock({ ...goodMeta, status: 'running' }, now)).toBe(true)
  })

  it('treats a fresh lock as not stale', () => {
    const fresh = new Date(now - 60_000).toISOString()
    expect(isStaleLock({ ...goodMeta, status: 'running', locked_at: fresh }, now)).toBe(false)
  })

  it('treats a lock older than the TTL as stale', () => {
    const old = new Date(now - DEFAULT_LOCK_TTL_MS - 1000).toISOString()
    expect(isStaleLock({ ...goodMeta, status: 'running', locked_at: old }, now)).toBe(true)
  })

  it('treats an unparseable locked_at as stale', () => {
    expect(isStaleLock({ ...goodMeta, status: 'running', locked_at: 'nope' }, now)).toBe(true)
  })
})

describe('findDuplicateIds (task-id uniqueness)', () => {
  it('returns empty when all ids are unique', () => {
    expect(findDuplicateIds(['a', 'b', 'c'])).toEqual([])
  })

  it('reports duplicated ids', () => {
    expect(findDuplicateIds(['a', 'b', 'a', 'c', 'b']).sort()).toEqual(['a', 'b'])
  })
})

describe('outbox output contract', () => {
  const base: OutboxReport = {
    taskId: 'demo',
    status: 'done',
    priority: 'high',
    slice: 'none',
    branch: 'dispatch/demo',
    commit: 'abc1234',
    completedAt: '2026-06-03T09:31:00Z',
    summary: 'Did the thing.',
    filesChanged: ['a.ts', 'b.ts'],
    commandsRun: ['npm run test'],
    testResults: 'npm run test → 380 passed / 28 files',
    nextRecommendation: 'Proceed to Phase 3.',
  }

  it('uses a deterministic, non-timestamped path', () => {
    expect(outboxPath('phase1-smoke')).toBe('beactive-dispatch/outbox/phase1-smoke.md')
  })

  it('renders every required Phase 2 section', () => {
    const md = renderOutbox(base)
    for (const section of [
      '## Status',
      '## Execution summary',
      '## Files changed',
      '## Commands run',
      '## Test results',
      '## Risk',
      '## Next recommendation',
    ]) {
      expect(md).toContain(section)
    }
    expect(md).toContain('task_id: demo')
    expect(md).toContain('- a.ts')
    expect(md).toContain('npm run test → 380 passed / 28 files')
  })

  it('defaults risk to none and renders empty lists as "- none"', () => {
    const md = renderOutbox({ ...base, risk: undefined, filesChanged: [], commandsRun: [] })
    expect(md).toMatch(/## Risk\nnone/)
    expect(md).toMatch(/## Files changed\n {2}- none/)
  })

  it('is pure/deterministic — identical input yields identical output', () => {
    expect(renderOutbox(base)).toBe(renderOutbox(base))
  })
})

describe('enqueue input contract (buildTaskFile / validateEnqueueInput)', () => {
  const NOW = '2026-06-03T12:00:00.000Z'
  const valid: EnqueueInput = { id: 'do-thing', source: 'cli', priority: 'high', model_effort: 'low' }

  it('accepts a minimal valid input and forces status/created_at', () => {
    const r = buildTaskFile(valid, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.meta.status).toBe('pending')
    expect(r.meta.created_at).toBe(NOW)
    expect(r.meta.slice).toBe('none') // defaulted
    expect(r.content).toContain('status: pending')
    expect(r.content).toContain(`created_at: ${NOW}`)
  })

  it('rejects each missing required field', () => {
    const errs = validateEnqueueInput({})
    for (const f of ['id', 'source', 'priority', 'model_effort']) {
      expect(errs).toContain(`missing required field: ${f}`)
    }
  })

  it('does NOT require created_at or status from the caller', () => {
    expect(validateEnqueueInput(valid)).toEqual([])
  })

  it('rejects any status other than pending (no creating running/done/failed)', () => {
    for (const bad of ['running', 'done', 'failed', 'blocked']) {
      const r = buildTaskFile({ ...valid, status: bad }, NOW)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/status must initialize as "pending"/)
    }
  })

  it('ignores a caller-supplied created_at — enqueue is authoritative', () => {
    const r = buildTaskFile({ ...valid, created_at: '1999-01-01T00:00:00Z' }, NOW)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.meta.created_at).toBe(NOW)
  })

  it('rejects an id with path-traversal / unsafe characters', () => {
    for (const badId of ['../evil', 'a/b', 'Up', 'has space', '_x']) {
      const r = buildTaskFile({ ...valid, id: badId }, NOW)
      expect(r.ok).toBe(false)
    }
  })

  it('rejects invalid priority and model_effort', () => {
    expect(validateEnqueueInput({ ...valid, priority: 'urgent' })).toContain('invalid priority: urgent')
    expect(validateEnqueueInput({ ...valid, model_effort: 'max' })).toContain('invalid model_effort: max')
  })

  it('carries optional notes + body into the rendered file', () => {
    const r = buildTaskFile({ ...valid, notes: 'be careful', body: 'Do X. DoD: Y.' }, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.content).toContain('notes: be careful')
    expect(r.content).toContain('Do X. DoD: Y.')
  })

  it('renderTaskFile emits deterministic ordered frontmatter', () => {
    const a = renderTaskFile({ id: 'x', source: 'cli', status: 'pending', priority: 'low', model_effort: 'low', created_at: NOW, slice: 'none' }, 'body')
    const b = renderTaskFile({ slice: 'none', created_at: NOW, model_effort: 'low', priority: 'low', status: 'pending', source: 'cli', id: 'x' }, 'body')
    expect(a).toBe(b) // key insertion order must not matter
  })
})
