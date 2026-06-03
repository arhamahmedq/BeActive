/**
 * Telegram bot runner (Phase 4) — the ONLY networked component.
 *
 * A minimal, dependency-free long-poll loop (global fetch, no SDK). It is pure
 * glue: it wires the real enqueue() into the pure adapter and ships replies. It
 * contains NO task logic — every decision lives in handleTelegramMessage/enqueue.
 *
 * This is a long-running process; run it yourself (it is not started by tests or
 * the kernel):
 *
 *   TELEGRAM_BOT_TOKEN=...  TELEGRAM_ALLOWED_CHAT_IDS=12345,67890 \
 *     npx tsx beactive-dispatch/transport/telegram.bot.ts
 *
 * Security: the token is read from env only (never logged, never committed); the
 * allowlist is fail-closed (unset ⇒ nobody can enqueue).
 */

import { enqueue } from '../lib/enqueue'
import { handleTelegramMessage, type TelegramMessage } from './telegram.adapter'

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ALLOWED = new Set(
  (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n)),
)

const API = `https://api.telegram.org/bot${TOKEN}`

async function sendMessage(chatId: number, text: string): Promise<void> {
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  }).catch((err) => console.error('sendMessage failed:', (err as Error).message))
}

interface TgUpdate {
  update_id: number
  message?: { message_id?: number; text?: string; chat: { id: number }; from?: { id: number; username?: string } }
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is not set — refusing to start.')
    process.exit(1)
  }
  if (ALLOWED.size === 0) {
    console.warn('TELEGRAM_ALLOWED_CHAT_IDS is empty — fail-closed: all messages will be rejected.')
  }
  console.log('beactive-dispatch telegram bot: polling…')
  let offset = 0
  for (;;) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`)
      const data = (await res.json()) as { result?: TgUpdate[] }
      for (const u of data.result ?? []) {
        offset = u.update_id + 1
        const m = u.message
        if (!m) continue
        const msg: TelegramMessage = { text: m.text, chat: { id: m.chat.id }, from: m.from, message_id: m.message_id }
        const { reply } = handleTelegramMessage(msg, enqueue, { allowedChatIds: ALLOWED, now: () => new Date() })
        await sendMessage(m.chat.id, reply)
      }
    } catch (err) {
      console.error('poll error:', (err as Error).message)
      await new Promise((r) => setTimeout(r, 3000)) // back off, then keep polling
    }
  }
}

void main()
