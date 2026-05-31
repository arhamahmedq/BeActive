import { createBrowserClient } from '@supabase/ssr'

// 60-day maxAge matches the Supabase refresh token lifetime, making sessions
// persist across browser restarts — critical for a daily habit fitness app.
const SESSION_MAX_AGE = 60 * 60 * 24 * 60

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        maxAge: SESSION_MAX_AGE,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    }
  )
}
