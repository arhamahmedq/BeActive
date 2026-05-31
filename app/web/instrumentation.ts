// Next.js App Router runs this file once per process on startup, before any
// request is handled. Use it to register anything that must be initialized
// exactly once per process lifecycle.
export async function register() {
  // Only run in the Node.js runtime (not Edge Runtime, which lacks EventEmitter)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerEventHandlers } = await import('./lib/events/handlers')
    registerEventHandlers()
  }
}
