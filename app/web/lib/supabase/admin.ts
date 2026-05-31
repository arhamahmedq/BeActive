import 'server-only'

import { createClient } from '@supabase/supabase-js'

// SERVICE ROLE CLIENT — bypasses ALL Supabase Row Level Security.
// Use ONLY in server-side workers and admin operations. NEVER in API route
// handlers that serve user requests. NEVER import in client components.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}
