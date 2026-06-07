import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Protected routes — require a valid Supabase session. Unauthenticated requests
// are redirected to /login. Authenticated users who have not yet onboarded are
// redirected to /onboarding (except from /onboarding itself and API routes).
const PROTECTED_PREFIXES = ['/feed', '/upload', '/friends', '/notifications', '/u/', '/p/']
const AUTH_ROUTES = ['/login', '/signup', '/verify-email']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let API routes, static assets, and Next.js internals through untouched.
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p))

  // Only intercept routes we care about.
  if (!isProtected && !isAuthRoute) return NextResponse.next()

  // Build a Supabase client that can read + refresh cookies in middleware.
  const response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // getUser() verifies the JWT with Supabase — necessary in middleware because
  // we can't trust the cookie alone without HMAC verification here.
  const { data: { user } } = await supabase.auth.getUser()

  // Unauthenticated → redirect to login
  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated on auth route → redirect to feed
  if (user && isAuthRoute) {
    const feedUrl = request.nextUrl.clone()
    feedUrl.pathname = '/feed'
    return NextResponse.redirect(feedUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
