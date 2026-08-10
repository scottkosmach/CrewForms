-- ============================================================================
-- User accounts: per-user data tables for extension cloud sync
-- ============================================================================
-- The extension keeps chrome.storage.local as its source of truth and syncs
-- records here directly via PostgREST (anon key + user JWT). RLS is the
-- security boundary: every row is owned by auth.uid() and invisible to anyone
-- else. Records keep their existing extension-generated string ids (base36),
-- stored as local_id, and the record body is an opaque jsonb payload so the
-- loosely-typed extension record shapes can evolve without schema churn.
--
-- Sync model: last-write-wins on updated_at (client-stamped, milliseconds
-- epoch inside data, server timestamptz on the row), deletes are tombstones
-- (deleted = true) so they propagate to other devices.
--
-- NOTE: 20260805000000_lock_down_rls.sql revoked table access from
-- authenticated as a posture; these NEW tables explicitly grant authenticated
-- back in, scoped by RLS. Existing tables (site_mappings, excel_templates,
-- upload_sessions, connection_tests) remain service-role-only.

-- Shared updated_at trigger ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Per-user record tables ------------------------------------------------------
-- boats / companies / trips / travelers all share the same shape.
CREATE TABLE IF NOT EXISTS public.boats (
  user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  local_id   text        NOT NULL,
  data       jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted    boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, local_id)
);

CREATE TABLE IF NOT EXISTS public.companies (
  user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  local_id   text        NOT NULL,
  data       jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted    boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, local_id)
);

CREATE TABLE IF NOT EXISTS public.trips (
  user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  local_id   text        NOT NULL,
  data       jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted    boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, local_id)
);

CREATE TABLE IF NOT EXISTS public.travelers (
  user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  local_id   text        NOT NULL,
  data       jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted    boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, local_id)
);

-- One captain profile per account.
CREATE TABLE IF NOT EXISTS public.captain_profiles (
  user_id    uuid        NOT NULL DEFAULT auth.uid() PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  data       jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Delta-pull index + updated_at triggers, per table.
CREATE INDEX IF NOT EXISTS boats_user_updated_idx     ON public.boats     (user_id, updated_at);
CREATE INDEX IF NOT EXISTS companies_user_updated_idx ON public.companies (user_id, updated_at);
CREATE INDEX IF NOT EXISTS trips_user_updated_idx     ON public.trips     (user_id, updated_at);
CREATE INDEX IF NOT EXISTS travelers_user_updated_idx ON public.travelers (user_id, updated_at);

DROP TRIGGER IF EXISTS set_updated_at ON public.boats;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.boats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.companies;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.trips;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.travelers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.travelers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.captain_profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.captain_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: owner-only, per command ------------------------------------------------
ALTER TABLE public.boats            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travelers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captain_profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['boats', 'companies', 'trips', 'travelers', 'captain_profiles'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "own rows select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "own rows insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "own rows update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "own rows delete" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "own rows select" ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())', t);
    EXECUTE format(
      'CREATE POLICY "own rows insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())', t);
    EXECUTE format(
      'CREATE POLICY "own rows update" ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
    EXECUTE format(
      'CREATE POLICY "own rows delete" ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())', t);
  END LOOP;
END;
$$;

-- Explicit grants: the lockdown migration revoked broadly, so do not rely on
-- default privileges. anon gets nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boats            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travelers        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.captain_profiles TO authenticated;
REVOKE ALL ON public.boats, public.companies, public.trips,
              public.travelers, public.captain_profiles FROM anon;

-- upload_sessions ownership ---------------------------------------------------
-- Stamped by /api/sessions POST once session creation requires auth; the table
-- stays service-role-only (no new policies), the API enforces ownership on the
-- destructive image-drain endpoint. Nullable so in-flight rows survive deploy.
ALTER TABLE public.upload_sessions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

-- Traveler images bucket ------------------------------------------------------
-- Private; objects live at <auth.uid()>/<traveler local_id>.<ext> so the
-- folder prefix doubles as the ownership check.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'traveler-images',
  'traveler-images',
  false,
  10485760,  -- 10MB per passport photo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "traveler images select own folder" ON storage.objects;
DROP POLICY IF EXISTS "traveler images insert own folder" ON storage.objects;
DROP POLICY IF EXISTS "traveler images update own folder" ON storage.objects;
DROP POLICY IF EXISTS "traveler images delete own folder" ON storage.objects;

CREATE POLICY "traveler images select own folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'traveler-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "traveler images insert own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'traveler-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "traveler images update own folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'traveler-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'traveler-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "traveler images delete own folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'traveler-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Security fix: templates bucket was open to the anon key ---------------------
-- The policies created in 20251230000001 have no TO clause, so they applied to
-- PUBLIC — anyone holding the shipped anon key could read, overwrite or delete
-- the Excel templates. All template access is server-side via the service-role
-- client (which bypasses RLS), so no replacement policies are needed.
DROP POLICY IF EXISTS "Allow authenticated read access to templates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated insert to templates"      ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update to templates"      ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete from templates"    ON storage.objects;
