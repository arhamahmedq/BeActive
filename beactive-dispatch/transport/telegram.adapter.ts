/**
 * Telegram transport adapter (Phase 4) — PURE. No I/O, no network, no fs.
 *
 * This is a THIN caller of enqueue(). It owns ZERO task-state semantics:
 *   - it does NOT validate task fields      (enqueue/buildTaskFile does)
 *   - it does NOT detect duplicates         (enqueue does)
 *   - it does NOT write files               (enqueue does)
 *   - it does NOT mutate task state         (only the kernel does)
 *
 * It does exactly one thing: translate a Telegram message into an EnqueueInput,
 * call the injected enqueue(), and format the EnqueueResult into a reply string.
 *
 * Authorization (allowlist) and input sanitization (length cap) live here because
 * they are TRANSPORT/SECURITY concerns, not task/business rules.
 *
 * Dependency direction: transport → enqueue → dispatch-core. Nothing imports this.
 */

import { type EnqueueInput } from '../lib/dispatch'
import { type EnqueueResult } from '../lib/enqueue'

/** Minimal shape of the fields we read from a Telegram update's message. */
export interface TelegramMessage {
  text?: string
  chat: { id: number }
  from?: { id: number; username?: string }
  /**
   * Telegram's per-chat message id. When present it makes the derived task id
   * deterministic for a given source message, so an at-least-once redelivery of
   * the SAME update maps to the SAME id and enqueue() dedupes it (idempotency).
   */
  message_id?: number
}

/** The enqueue function, injected so the adapter stays pure + testable. */
export type Enqueuer = (input: EnqueueInput) => EnqueueResult

export interface AdapterContext {
  /** Chat ids permitted to enqueue. Empty ⇒ fail-closed (reject everyone). */
  allowedChatIds: ReadonlySet<number>
  now: () => Date
}

/** Body is capped to bound the size of a queued task file (security, not validation). */
export const MAX_BODY_LEN = 2000
const ID_SLUG_MAX = 40
const VALID_PRIORITIES = new Set(['high', 'medium', 'low'])

/** Lowercase, ASCII-only, hyphen-collapsed slug — also guarantees a safe id candidate. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ID_SLUG_MAX)
    .replace(/-+$/g, '')
}

/**
 * Pull an optional `#high|#medium|#low` priority tag out of the text.
 * Returns the chosen priority (default medium) and the text with the tag removed.
 * This is input *shaping*, not validation — enqueue is still the authority.
 */
function extractPriority(text: string): { priority: string; rest: string } {
  const m = text.match(/(^|\s)#(high|medium|low)\b/i)
  if (!m) return { priority: 'medium', rest: text }
  const priority = m[2]!.toLowerCase()
  const rest = (text.slice(0, m.index!) + ' ' + text.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').trim()
  return { priority: VALID_PRIORITIES.has(priority) ? priority : 'medium', rest }
}

/**
 * Map a Telegram message to an EnqueueInput candidate. Pure. Performs NO
 * validation — it produces a well-shaped request; enqueue() validates/rejects.
 */
export function mapMessageToEnqueueInput(msg: TelegramMessage, now: Date): EnqueueInput {
  const raw = (msg.text ?? '').replace(/^\/(task|enqueue)\b/i, '').trim()
  const { priority, rest } = extractPriority(raw)
  const body = rest.slice(0, MAX_BODY_LEN)
  const slug = slugify(body) || 'task'
  // Idempotency: prefer the source message's stable identity (chat+message_id) so
  // a redelivered Telegram update yields the SAME id (enqueue then dedupes it).
  // Fall back to a wall-clock suffix only when message_id is unavailable.
  const suffix =
    msg.message_id !== undefined
      ? `c${msg.chat.id}-m${msg.message_id}`.replace(/[^a-z0-9-]/g, '')
      : now.getTime().toString(36)
  const id = `${slug}-${suffix}`
  const who = msg.from?.username ? `@${msg.from.username}` : `user ${msg.from?.id ?? 'unknown'}`
  const input: EnqueueInput = {
    id,
    source: 'telegram',
    priority,
    model_effort: 'medium',
    notes: `from ${who} (chat ${msg.chat.id})`,
    body: body || 'No description provided.',
  }
  return input
}

/**
 * The whole transport: authorize → map → enqueue → format reply.
 * Never throws; always returns a user-facing reply string.
 */
export function handleTelegramMessage(
  msg: TelegramMessage,
  enqueue: Enqueuer,
  ctx: AdapterContext,
): { reply: string } {
  const text = (msg.text ?? '').trim()
  if (!text) {
    return { reply: 'Send a task description and I will queue it (optionally tag #high / #medium / #low).' }
  }
  // Fail-closed authorization. A transport/security concern, not a task rule.
  if (!ctx.allowedChatIds.has(msg.chat.id)) {
    return { reply: '⛔ Not authorized to submit tasks.' }
  }
  const input = mapMessageToEnqueueInput(msg, ctx.now())
  const result = enqueue(input)
  if (result.ok) {
    return { reply: `✅ Queued task \`${result.id}\`. It will run on the next dispatch cycle.` }
  }
  return { reply: `⚠️ Could not queue task: ${result.errors.join('; ')}` }
}
