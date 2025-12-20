/**
 * Browser-side Supabase client
 * 
 * Use this in Client Components (files with 'use client').
 * This client runs in the browser and handles auth state automatically.
 */

import { createBrowserClient } from '@supabase/ssr'

// Type import for Database - will be generated after running:
// supabase gen types typescript --linked > src/types/database.ts
// import { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

