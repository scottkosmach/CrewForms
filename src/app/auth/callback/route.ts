/**
 * Auth callback route
 *
 * Landing point for every Supabase email/OAuth link:
 * - OAuth (PKCE): ?code=...            -> exchangeCodeForSession
 * - Email confirm / recovery links:    ?token_hash=...&type=... -> verifyOtp
 *
 * The `next` param says where to go afterwards; it is sanitized to a local
 * path to prevent open redirects.
 */

import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

function sanitizeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/admin'
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = sanitizeNext(searchParams.get('next'))

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth', request.url))
}
