import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { buildContentSecurityPolicy, generateNonce } from './lib/csp'

// Authenticated-only pages — unauthenticated requests redirect to /login.
// Keep this list in sync whenever new top-level routes are added.
const PROTECTED_PATHS = [
  '/feed',
  '/upload',
  '/onboarding',
  '/notifications',
  '/friends',
  '/u/',      // /u/[username] — profile pages
  '/p/',      // /p/[postId]  — standalone post viewer
]
const AUTH_PATHS = ['/login', '/signup', '/verify-email']

export async function proxy(request: NextRequest) {
  const nonce = generateNonce()
  const cspHeader = buildContentSecurityPolicy(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not add any logic between createServerClient and getUser()
  // A simple mistake here could result in a hard to debug issue
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))
  const isAuthPath = AUTH_PATHS.some((p) => pathname.startsWith(p))

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirectTo', pathname)
    const response = NextResponse.redirect(loginUrl)
    response.headers.set('Content-Security-Policy', cspHeader)
    return response
  }

  if (isAuthPath && user) {
    const feedUrl = request.nextUrl.clone()
    feedUrl.pathname = '/feed'
    const response = NextResponse.redirect(feedUrl)
    response.headers.set('Content-Security-Policy', cspHeader)
    return response
  }

  supabaseResponse.headers.set('Content-Security-Policy', cspHeader)
  return supabaseResponse
}

export const config = {
  matcher: [
    // Exclude: static assets, images, favicon, AND all /api/* routes.
    // API routes validate sessions themselves via createClient() — running the
    // proxy on every API call adds a redundant Supabase round-trip.
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
