import { createClient } from '@supabase/supabase-js'

// SERVER ONLY — NEVER import this in client components
// Uses service key for admin operations only
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}
