/**
 * Auth Middleware
 * 
 * This middleware runs on every request and:
 * 1. Refreshes the user's session if it's expired
 * 2. Keeps the auth state in sync between server and client
 * 
 * CRITICAL: Don't skip this - it prevents auth state from becoming stale.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'

// Type for cookie objects used by Supabase SSR
type CookieToSet = {
  name: string
  value: string
  options?: Partial<ResponseCookie>
}

export async function middleware(request: NextRequest) {
  // Create a response object that we can modify
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create Supabase client for the middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read cookies from the request
        getAll() {
          return request.cookies.getAll()
        },
        // Write cookies to both request and response
        setAll(cookiesToSet: CookieToSet[]) {
          // Update request cookies (for downstream handlers)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Create new response with updated request
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          // Update response cookies (for the browser)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: This refreshes the session if expired
  // The getUser() call will update cookies if the session was refreshed
  await supabase.auth.getUser()

  return response
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

