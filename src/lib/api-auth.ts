/**
 * API route authentication
 *
 * Accepts either of the two credentials this app issues:
 *  - a Supabase cookie session (web app pages calling their own API), or
 *  - an `Authorization: Bearer <access_token>` header (the Chrome extension,
 *    whose supabase-js session lives in chrome.storage, not cookies).
 *
 * Routes keep using the service-role client for data access after this check;
 * RLS matters for the extension's direct Supabase table access, not here.
 */

import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Resolve the requesting user from a Bearer token or cookie session.
 * Returns null when neither yields a valid user.
 */
export async function getApiUser(request: NextRequest): Promise<User | null> {
  const authHeader = request.headers.get('authorization')

  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    // Throwaway anon-key client: getUser(token) validates the JWT against
    // Supabase's auth server (expiry, revocation) without touching cookies.
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data, error } = await supabase.auth.getUser(token)
    if (error) return null
    return data.user ?? null
  }

  const supabase = await createServerClient()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

/**
 * Auth gate for route handlers. Usage:
 *
 *   const auth = await requireApiUser(request)
 *   if (auth.response) return auth.response
 *   // auth.user is the signed-in user
 */
export async function requireApiUser(
  request: NextRequest
): Promise<{ user: User; response?: never } | { user?: never; response: NextResponse }> {
  const user = await getApiUser(request)
  if (!user) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  return { user }
}

/**
 * Write-gate for global data (site mappings, Excel templates) that corrupts
 * CBP/USCG filings if tampered with. Single-operator control via ADMIN_EMAILS
 * (comma-separated). When the variable is unset, any signed-in user passes —
 * fine while there is exactly one user, explicit once there are more.
 */
export function isAdmin(user: User): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (!adminEmails.length) return true
  return !!user.email && adminEmails.includes(user.email.toLowerCase())
}

/** Ready-made 403 for isAdmin failures. */
export function forbiddenResponse(): NextResponse {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
