import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { enqueue, type EnqueueOptions } from '../../../beactive-dispatch/lib/enqueue'
import type { EnqueueInput } from '../../../beactive-dispatch/lib/dispatch'

const NOW = new Date('2026-06-03T12:00:00.000Z')
const valid: EnqueueInput = { id: 'task-one', source: 'cli', priority: 'high', model_effort: 'low', body: 'Do it.' }

let root: string
let queueDir: string
let archivedDir: string
let opts: EnqueueOptions

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'enqueue-'))
  queueDir = join(root, 'queue')
  archivedDir = join(root, 'archived')
  mkdirSync(queueDir, { recursive: true })
  mkdirSync(archivedDir, { recursive: true })
  opts = { queueDir, archivedDir, now: () => NOW }
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('enqueue — happy path', () => {
  it('accepts a valid task and writes queue/<id>.md', () => {
    const r = enqueue(valid, opts)
    expect(r).toEqual({ ok: true, id: 'task-one', path: join(queueDir, 'task-one.md') })
    const written = readFileSync(join(queueDir, 'task-one.md'), 'utf8')
    expect(written).toContain('id: task-one')
    expect(written).toContain('status: pending')
    expect(written).toContain('created_at: 2026-06-03T12:00:00.000Z')
    expect(written).toContain('Do it.')
  })

  it('leaves no temp files behind', () => {
    enqueue(valid, opts)
    expect(readdirSync(queueDir).filter((f) => f.includes('.tmp'))).toEqual([])
  })
})

describe('enqueue — validation failures (no side effects)', () => {
  it('rejects malformed input (missing required fields) and writes nothing', () => {
    const r = enqueue({ id: 'x' } as EnqueueInput, opts)
    expect(r.ok).toBe(false)
    expect(readdirSync(queueDir)).toEqual([])
  })

  it('rejects an attempt to create a running/done/failed task', () => {
    const r = enqueue({ ...valid, status: 'running' }, opts)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/status must initialize as "pending"/)
    expect(readdirSync(queueDir)).toEqual([])
  })

  it('rejects an unsafe id (path traversal) and writes nothing outside queue', () => {
    const r = enqueue({ ...valid, id: '../escape' }, opts)
    expect(r.ok).toBe(false)
    expect(readdirSync(queueDir)).toEqual([])
    expect(existsSync(join(root, 'escape.md'))).toBe(false)
  })
})

describe('enqueue — duplicate protection (fail fast, no overwrite)', () => {
  it('rejects a second task with the same id (already in queue)', () => {
    expect(enqueue(valid, opts).ok).toBe(true)
    const before = readFileSync(join(queueDir, 'task-one.md'), 'utf8')
    const second = enqueue({ ...valid, body: 'DIFFERENT — should never land' }, opts)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.errors.join(' ')).toMatch(/duplicate task id/)
    // original file is byte-for-byte unchanged
    expect(readFileSync(join(queueDir, 'task-one.md'), 'utf8')).toBe(before)
  })

  it('rejects an id that already exists in archived/', () => {
    writeFileSync(
      join(archivedDir, 'task-one.md'),
      '---\nid: task-one\nsource: cli\nstatus: done\npriority: high\nmodel_effort: low\ncreated_at: 2026-06-01T00:00:00Z\nslice: none\n---\nold',
    )
    const r = enqueue(valid, opts)
    expect(r.ok).toBe(false)
    expect(existsSync(join(queueDir, 'task-one.md'))).toBe(false)
  })
})

describe('enqueue — queue ownership: cannot mutate existing tasks', () => {
  it('never modifies an existing running task file', () => {
    const running =
      '---\nid: task-one\nsource: cli\nstatus: running\npriority: high\nmodel_effort: low\ncreated_at: 2026-06-02T00:00:00Z\nslice: none\nlocked_at: 2026-06-02T00:00:01Z\n---\nin flight'
    writeFileSync(join(queueDir, 'task-one.md'), running)
    const r = enqueue(valid, opts) // same id, status pending
    expect(r.ok).toBe(false)
    // the running task is untouched — enqueue is structurally incapable of mutation
    expect(readFileSync(join(queueDir, 'task-one.md'), 'utf8')).toBe(running)
  })

  it('does not touch archived/ on any operation', () => {
    const archivedBefore = readdirSync(archivedDir)
    enqueue(valid, opts)
    enqueue({ ...valid, id: 'task-two' }, opts)
    expect(readdirSync(archivedDir)).toEqual(archivedBefore)
  })
})

describe('enqueue — deterministic result', () => {
  it('returns a structured ok result on success', () => {
    expect(enqueue({ ...valid, id: 'abc' }, opts)).toEqual({ ok: true, id: 'abc', path: join(queueDir, 'abc.md') })
  })

  it('returns a structured failure result (never throws) on bad input', () => {
    const r = enqueue({} as EnqueueInput, opts)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Array.isArray(r.errors)).toBe(true)
  })
})
