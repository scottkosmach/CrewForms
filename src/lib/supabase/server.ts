/**
 * Server-side Supabase client
 * 
 * Use this in Server Components, Server Actions, and Route Handlers.
 * Creates a client that can read/write cookies for session management.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Type import for Database - will be generated after running:
// supabase gen types typescript --linked > src/types/database.ts
// import { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Get all cookies from the request
        getAll() {
          return cookieStore.getAll()
        },
        // Set cookies on the response
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component where cookies can't be set
            // This is expected behavior - ignore the error
          }
        },
      },
    }
  )
}

