/**
 * Telegram transport SIMULATOR (Phase 4.5 live-validation aid). Not part of the
 * runtime — a CLI that drives the REAL adapter + REAL enqueue() with a synthetic
 * message, so the Telegram→Transport→enqueue()→queue/ chain can be validated
 * without standing up the bot or touching the network.
 *
 * Usage:
 *   SIM_ALLOWED_CHAT_IDS=42 \
 *   SIM_QUEUE_DIR=/tmp/scratch/queue  SIM_ARCHIVED_DIR=/tmp/scratch/archived \
 *     npx tsx beactive-dispatch/transport/telegram.simulate.ts "<message>" <chatId>
 *
 * If SIM_QUEUE_DIR is unset it writes to the real beactive-dispatch/queue/.
 * Prints a JSON result and exits 0 on enqueue success, 2 on enqueue failure,
 * 3 when the message is rejected before enqueue (empty / unauthorized).
 */

import { enqueue, type EnqueueOptions } from '../lib/enqueue'
import { handleTelegramMessage, type Enqueuer } from './telegram.adapter'

const message = process.argv[2] ?? ''
const chatId = Number.parseInt(process.argv[3] ?? '0', 10)

const allowedChatIds = new Set(
  (process.env.SIM_ALLOWED_CHAT_IDS ?? '')
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n)),
)

const opts: EnqueueOptions = {}
if (process.env.SIM_QUEUE_DIR) opts.queueDir = process.env.SIM_QUEUE_DIR
if (process.env.SIM_ARCHIVED_DIR) opts.archivedDir = process.env.SIM_ARCHIVED_DIR

const enq: Enqueuer = (input) => enqueue(input, opts)

// Optional stable message identity, so the duplicate/redelivery path can be
// validated deterministically: SIM_MESSAGE_ID=5 ⇒ resending yields the same id.
const messageId = process.env.SIM_MESSAGE_ID ? Number.parseInt(process.env.SIM_MESSAGE_ID, 10) : undefined

const { reply } = handleTelegramMessage(
  { text: message, chat: { id: chatId }, from: { id: chatId, username: 'sim' }, message_id: messageId },
  enq,
  { allowedChatIds, now: () => new Date() },
)

console.log(JSON.stringify({ chatId, message, reply }, null, 2))

if (reply.startsWith('✅')) process.exit(0)
if (reply.startsWith('⚠️')) process.exit(2)
process.exit(3)
