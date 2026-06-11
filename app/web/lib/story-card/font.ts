import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Story-card font loader
// ---------------------------------------------------------------------------
// Loads the bundled Plus Jakarta Sans weights for Satori / @vercel/og.
//
// Two hard constraints learned the hard way (both crash the OG render mid-
// stream with an empty reply, because ImageResponse renders lazily and the
// throw escapes any try/catch around `new ImageResponse(...)`):
//
//   1. Satori parses TTF / OTF / WOFF — NOT WOFF2.
//      A .woff2 throws "Unsupported OpenType signature wOF2".
//   2. Satori's bundled parser cannot read a VARIABLE font's `fvar` table.
//      A variable .ttf throws "Cannot read properties of undefined" in
//      parseFvarAxis.
//
// So we ship STATIC, single-weight .ttf instances (700 + 800 — Plus Jakarta
// Sans' weight axis maxes at 800) and read them from disk. No render-time
// network fetch → also removes the CDN-timeout failure mode entirely.
//
// `new URL('./<literal>.ttf', import.meta.url)` MUST use string literals so
// Next statically traces the assets into the serverless bundle on Vercel. We
// read via fs because Node `fetch` does not support file:// URLs.
// ---------------------------------------------------------------------------

export interface StoryFont {
  name: 'Plus Jakarta Sans'
  data: ArrayBuffer
  weight: 700 | 800
  style: 'normal'
}

let _fonts: StoryFont[] | null = null

async function readFontFile(url: URL): Promise<ArrayBuffer> {
  const buf = await readFile(fileURLToPath(url))
  // Hand Satori a clean ArrayBuffer slice (not the pooled Node Buffer).
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/**
 * Bundled static Plus Jakarta Sans (700, 800), ready to pass to
 * `new ImageResponse(el, { fonts })`. Cached per cold start. Returns [] on
 * failure so the route degrades to the built-in font instead of crashing.
 */
export async function loadStoryFonts(): Promise<StoryFont[]> {
  if (_fonts) return _fonts
  try {
    const [d700, d800] = await Promise.all([
      readFontFile(new URL('./PlusJakartaSans-700.ttf', import.meta.url)),
      readFontFile(new URL('./PlusJakartaSans-800.ttf', import.meta.url)),
    ])
    _fonts = [
      { name: 'Plus Jakarta Sans', data: d700, weight: 700, style: 'normal' },
      { name: 'Plus Jakarta Sans', data: d800, weight: 800, style: 'normal' },
    ]
    return _fonts
  } catch (err) {
    console.error('[story-card] font load failed:', err)
    return []
  }
}
