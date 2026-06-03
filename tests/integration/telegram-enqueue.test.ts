import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { enqueue } from '../../beactive-dispatch/lib/enqueue'
import {
  handleTelegramMessage,
  type TelegramMessage,
  type AdapterContext,
} from '../../beactive-dispatch/transport/telegram.adapter'

/**
 * Integration: Telegram adapter → REAL enqueue → real filesystem queue.
 * Proves the full transport path AND that enqueue remains the sole task creator
 * and the sole owner of duplicate detection — the adapter contributes neither.
 */

let root: string
let queueDir: string
let archivedDir: string
const FIXED_NOW = new Date('2026-06-03T12:00:00.000Z')

const ctx = (): AdapterContext => ({ allowedChatIds: new Set([42]), now: () => FIXED_NOW })
const realEnqueue = (input: Parameters<typeof enqueue>[0]) =>
  enqueue(input, { queueDir, archivedDir, now: () => FIXED_NOW })
const msg = (text: string, chatId = 42, messageId?: number): TelegramMessage => ({
  text,
  chat: { id: chatId },
  from: { id: 7, username: 'arham' },
  message_id: messageId,
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tg-enqueue-'))
  queueDir = join(root, 'queue')
  archivedDir = join(root, 'archived')
  mkdirSync(queueDir, { recursive: true })
  mkdirSync(archivedDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('Telegram → enqueue integration', () => {
  it('a Telegram message lands as a pending task in queue/', () => {
    const { reply } = handleTelegramMessage(msg('Add a logout button #high'), realEnqueue, ctx())
    expect(reply).toMatch(/✅ Queued task/)

    const files = readdirSync(queueDir).filter((f) => f.endsWith('.md'))
    expect(files).toHaveLength(1)
    const content = readFileSync(join(queueDir, files[0]!), 'utf8')
    expect(content).toContain('status: pending')
    expect(content).toContain('source: telegram')
    expect(content).toContain('priority: high')
    expect(content).toContain('from @arham (chat 42)')
    expect(content).toContain('Add a logout button')
  })

  it('is idempotent on Telegram redelivery (same message_id ⇒ enqueue dedupes)', () => {
    // Telegram is at-least-once: the SAME update (same message_id) can be delivered
    // twice. The id derives from chat+message_id, so the 2nd maps to the same id and
    // enqueue refuses it — duplicate detection still owned by enqueue, not the adapter.
    const first = handleTelegramMessage(msg('same task', 42, 100), realEnqueue, ctx())
    expect(first.reply).toMatch(/✅ Queued task/)

    const redelivered = handleTelegramMessage(msg('same task', 42, 100), realEnqueue, ctx())
    expect(redelivered.reply).toMatch(/⚠️ Could not queue/)
    expect(redelivered.reply).toMatch(/duplicate task id/)

    // Exactly one file — the adapter never created a second, enqueue refused it.
    expect(readdirSync(queueDir).filter((f) => f.endsWith('.md'))).toHaveLength(1)
  })

  it('treats two DISTINCT messages with the same text as two tasks', () => {
    expect(handleTelegramMessage(msg('same text', 42, 1), realEnqueue, ctx()).reply).toMatch(/✅/)
    expect(handleTelegramMessage(msg('same text', 42, 2), realEnqueue, ctx()).reply).toMatch(/✅/)
    expect(readdirSync(queueDir).filter((f) => f.endsWith('.md'))).toHaveLength(2)
  })

  it('unauthorized senders never reach enqueue (no file written)', () => {
    const { reply } = handleTelegramMessage(msg('sneaky', 999), realEnqueue, ctx())
    expect(reply).toMatch(/Not authorized/)
    expect(readdirSync(queueDir).filter((f) => f.endsWith('.md'))).toHaveLength(0)
  })
})
