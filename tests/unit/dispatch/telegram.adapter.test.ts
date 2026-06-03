import { describe, it, expect, vi } from 'vitest'
import {
  handleTelegramMessage,
  mapMessageToEnqueueInput,
  MAX_BODY_LEN,
  type TelegramMessage,
  type AdapterContext,
  type Enqueuer,
} from '../../../beactive-dispatch/transport/telegram.adapter'
import { TASK_ID_RE } from '../../../beactive-dispatch/lib/dispatch'

const NOW = new Date('2026-06-03T12:00:00.000Z')
const okEnqueue: Enqueuer = (input) => ({ ok: true, id: input.id, path: `queue/${input.id}.md` })
const ctx = (ids: number[] = [42]): AdapterContext => ({ allowedChatIds: new Set(ids), now: () => NOW })
const msg = (over: Partial<TelegramMessage> = {}): TelegramMessage => ({
  text: 'Add a logout button',
  chat: { id: 42 },
  from: { id: 7, username: 'arham' },
  ...over,
})

describe('mapMessageToEnqueueInput (pure shaping — never validates)', () => {
  it('produces a safe, TASK_ID_RE-valid id', () => {
    const input = mapMessageToEnqueueInput(msg(), NOW)
    expect(TASK_ID_RE.test(input.id)).toBe(true)
    expect(input.source).toBe('telegram')
    expect(input.priority).toBe('medium') // default
    expect(input.model_effort).toBe('medium')
    expect(input.body).toContain('Add a logout button')
  })

  it('records sender traceability in notes', () => {
    expect(mapMessageToEnqueueInput(msg(), NOW).notes).toBe('from @arham (chat 42)')
  })

  it('parses an optional #priority tag and strips it from the body', () => {
    const input = mapMessageToEnqueueInput(msg({ text: 'Fix the feed #high please' }), NOW)
    expect(input.priority).toBe('high')
    expect(input.body).not.toContain('#high')
    expect(input.body).toContain('Fix the feed')
  })

  it('strips a leading /task or /enqueue command', () => {
    expect(mapMessageToEnqueueInput(msg({ text: '/task ship it' }), NOW).body).toBe('ship it')
  })

  it('caps body length (input sanitization)', () => {
    const input = mapMessageToEnqueueInput(msg({ text: 'x'.repeat(5000) }), NOW)
    expect(input.body!.length).toBeLessThanOrEqual(MAX_BODY_LEN)
  })

  it('falls back to a "task" slug for symbol-only text', () => {
    const input = mapMessageToEnqueueInput(msg({ text: '!!!@@@' }), NOW)
    expect(TASK_ID_RE.test(input.id)).toBe(true)
    expect(input.id.startsWith('task-')).toBe(true)
  })
})

describe('handleTelegramMessage (thin transport — delegates to enqueue)', () => {
  it('ignores empty text without calling enqueue', () => {
    const spy = vi.fn(okEnqueue)
    const { reply } = handleTelegramMessage(msg({ text: '   ' }), spy, ctx())
    expect(spy).not.toHaveBeenCalled()
    expect(reply).toMatch(/Send a task description/)
  })

  it('rejects unauthorized chats fail-closed and never calls enqueue', () => {
    const spy = vi.fn(okEnqueue)
    const { reply } = handleTelegramMessage(msg({ chat: { id: 999 } }), spy, ctx([42]))
    expect(spy).not.toHaveBeenCalled()
    expect(reply).toMatch(/Not authorized/)
  })

  it('fail-closed when the allowlist is empty (rejects everyone)', () => {
    const spy = vi.fn(okEnqueue)
    handleTelegramMessage(msg(), spy, ctx([]))
    expect(spy).not.toHaveBeenCalled()
  })

  it('calls enqueue exactly once with the mapped input and confirms the id', () => {
    const spy = vi.fn(okEnqueue)
    const { reply } = handleTelegramMessage(msg(), spy, ctx())
    expect(spy).toHaveBeenCalledTimes(1)
    const passed = spy.mock.calls[0]![0]
    expect(passed.source).toBe('telegram')
    expect(TASK_ID_RE.test(passed.id)).toBe(true)
    expect(reply).toMatch(/✅ Queued task/)
    expect(reply).toContain(passed.id)
  })

  it('propagates enqueue failures verbatim (no own validation)', () => {
    const failing: Enqueuer = () => ({ ok: false, errors: ['duplicate task id: "x" already exists'] })
    const { reply } = handleTelegramMessage(msg(), failing, ctx())
    expect(reply).toMatch(/⚠️ Could not queue/)
    expect(reply).toContain('duplicate task id')
  })

  it('does no work itself on failure — it is the enqueue result that decides', () => {
    // The adapter has no branch that creates/dedupes/validates; it only relays.
    const failing = vi.fn((): ReturnType<Enqueuer> => ({ ok: false, errors: ['missing required field: id'] }))
    handleTelegramMessage(msg(), failing, ctx())
    expect(failing).toHaveBeenCalledTimes(1)
  })
})
