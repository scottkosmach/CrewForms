/**
 * Service-role Supabase client — server-only.
 *
 * Every route in this app talks to tables that hold passport data. Those tables
 * are reached exclusively through API routes, so the browser never needs direct
 * table access, and the anon key never should have had it. This client uses the
 * service role key so the tables can be locked to service-role-only in RLS
 * (see supabase/migrations/*_lock_down_rls.sql).
 *
 * The service role key bypasses RLS entirely. Never import this from a client
 * component, and never return raw rows from it without filtering.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  if (!serviceRoleKey) {
    // Fail loudly rather than silently falling back to the anon key, which
    // would appear to work until RLS is locked down and then break in prod.
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. API routes require the service ' +
        'role key because the data tables are service-role-only under RLS.',
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: {
      // No user sessions here: this is a trusted server-side identity.
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cached;
}
