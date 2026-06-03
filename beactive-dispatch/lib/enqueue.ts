/**
 * Enqueue boundary (Phase 3) — the ONLY approved writer of new task files.
 *
 * Architectural invariant:
 *   External systems (Telegram, API, UI, CLI) MAY create tasks — only via enqueue().
 *   They MAY NOT mutate task state. The /process-dispatch kernel is the sole
 *   mutator of pending → running → done|failed → archived.
 *
 * Guarantees:
 *   - validates input, generates created_at + status:pending (buildTaskFile)
 *   - fail-fast on duplicate id (across queue/ AND archived/) — never overwrites
 *   - atomic write (temp file → rename); rolls back the temp on any failure
 *   - never reads, edits, moves, or deletes an existing task file
 *   - deterministic result: { ok: true, ... } | { ok: false, errors }; never silent
 */

import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { buildTaskFile, parseTaskFile, type EnqueueInput } from './dispatch'

const DEFAULT_ROOT = 'beactive-dispatch'

export interface EnqueueOptions {
  queueDir?: string
  archivedDir?: string
  /** Injectable clock for deterministic tests. */
  now?: () => Date
}

export type EnqueueResult =
  | { ok: true; id: string; path: string }
  | { ok: false; errors: string[] }

/** Collect existing task ids in a directory (by filename AND by `id` frontmatter). */
function collectIds(dir: string): Set<string> {
  const ids = new Set<string>()
  if (!existsSync(dir)) return ids
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue
    ids.add(file.replace(/\.md$/, ''))
    try {
      const { meta } = parseTaskFile(readFileSync(join(dir, file), 'utf8'))
      if (meta.id) ids.add(meta.id)
    } catch {
      /* unreadable file — ignore for id-collision purposes */
    }
  }
  return ids
}

export function enqueue(input: EnqueueInput, opts: EnqueueOptions = {}): EnqueueResult {
  const queueDir = opts.queueDir ?? join(DEFAULT_ROOT, 'queue')
  const archivedDir = opts.archivedDir ?? join(DEFAULT_ROOT, 'archived')
  const now = opts.now ?? ((): Date => new Date())

  // 1. Validate + build (pure). On failure: return immediately, zero side effects.
  const built = buildTaskFile(input, now().toISOString())
  if (!built.ok) return { ok: false, errors: built.errors }
  const id = built.meta.id

  // 2. Duplicate protection — fail fast across queue/ ∪ archived/. Never overwrite.
  const existing = new Set<string>([...collectIds(queueDir), ...collectIds(archivedDir)])
  const target = join(queueDir, `${id}.md`)
  if (existing.has(id) || existsSync(target)) {
    return {
      ok: false,
      errors: [`duplicate task id: "${id}" already exists in queue/ or archived/ — fail-fast, no overwrite, no mutation`],
    }
  }

  // 3. Atomic create. Write a fully-formed temp file ('wx' = never clobber),
  //    then linkSync it into place. linkSync is atomic create-if-absent: it
  //    throws EEXIST if the target already exists, so it CANNOT overwrite even
  //    under a same-id race (renameSync would have silently clobbered). The temp
  //    is then unlinked. On any failure the temp is removed — never a partial
  //    write, never a mutation of an existing task.
  const tmp = join(queueDir, `.${id}.${process.pid}.${Date.now()}.tmp`)
  try {
    if (!existsSync(queueDir)) mkdirSync(queueDir, { recursive: true })
    writeFileSync(tmp, built.content, { encoding: 'utf8', flag: 'wx' })
    linkSync(tmp, target) // atomic; throws EEXIST on duplicate race
    unlinkSync(tmp)
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      /* best-effort temp cleanup */
    }
    const e = err as NodeJS.ErrnoException
    if (e.code === 'EEXIST') {
      return { ok: false, errors: [`duplicate task id: "${id}" already exists — fail-fast, no overwrite (atomic)`] }
    }
    return { ok: false, errors: [`enqueue write failed (rolled back, no partial write): ${e.message}`] }
  }

  return { ok: true, id, path: target }
}
