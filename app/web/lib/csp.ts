// Per-request Content-Security-Policy — generated in proxy.ts (Phase D item 2).
//
// script-src uses a per-request nonce + 'strict-dynamic' instead of
// 'unsafe-inline'/'unsafe-eval' (see docs/AUDIT_2026-06-12.md finding S1).
// Browsers that support 'strict-dynamic' ignore 'self' for scripts and trust
// only the nonced script (and anything it loads); older browsers fall back to
// 'self' 'nonce-...'. 'unsafe-eval' is added in development only — Turbopack's
// HMR client relies on eval().

export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

export function buildContentSecurityPolicy(nonce: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const r2PublicUrl = process.env.R2_PUBLIC_URL ?? ''

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(process.env.NODE_ENV === 'development' ? ["'unsafe-eval'"] : []),
  ].join(' ')

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    // Supabase auth API + storage; wildcard covers R2 presigned upload endpoints
    `connect-src 'self' ${supabaseUrl} https://*.supabase.co wss://*.supabase.co https://*.r2.cloudflarestorage.com`,
    // R2 CDN for user-uploaded images (avatars, workout photos)
    `img-src 'self' blob: data: ${r2PublicUrl}`,
    "font-src 'self'",
    // Block all embedding
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}
