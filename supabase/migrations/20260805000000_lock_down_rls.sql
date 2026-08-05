-- Lock down RLS so passport data is no longer reachable with the anon key.
--
-- BEFORE THIS MIGRATION
--   upload_sessions, site_mappings and connection_tests each had
--   FOR ALL USING (true) WITH CHECK (true) policies. The anon key is shipped to
--   every browser (NEXT_PUBLIC_SUPABASE_ANON_KEY), so anyone holding it could
--   SELECT * FROM upload_sessions and read un-relayed base64 passport images,
--   and could insert, overwrite or delete any row in site_mappings.
--
-- AFTER
--   RLS stays enabled with NO policies on these tables. Under Postgres RLS a
--   table with no permissive policy denies everything, so anon and authenticated
--   get nothing. The service_role key bypasses RLS, so the API routes keep
--   working — which is why this migration MUST NOT run until those routes use
--   the service-role client.
--
-- ⚠️ ORDERING — applying this out of order takes the app down:
--   1. Ship src/lib/supabase/admin.ts and switch every API route to it.
--   2. Verify on the preview deployment that sessions, upload, images and
--      mappings all still work.
--   3. Apply this migration.
--   4. Purge existing upload_sessions rows (see the separate purge migration).
--   5. Rotate the anon key LAST, and set the new value in Vercel first.

-- upload_sessions ------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on upload_sessions" ON upload_sessions;
DROP POLICY IF EXISTS "Anyone can read upload_sessions"          ON upload_sessions;
DROP POLICY IF EXISTS "Anyone can insert upload_sessions"        ON upload_sessions;
DROP POLICY IF EXISTS "Anyone can update upload_sessions"        ON upload_sessions;
DROP POLICY IF EXISTS "Anyone can delete upload_sessions"        ON upload_sessions;

ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;
-- Belt and braces: RLS alone denies anon, but these tables should never have
-- been in the PostgREST-exposed grant set either.
REVOKE ALL ON upload_sessions FROM anon, authenticated;

-- site_mappings --------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on site_mappings" ON site_mappings;
DROP POLICY IF EXISTS "Anyone can read site_mappings"         ON site_mappings;
DROP POLICY IF EXISTS "Anyone can insert site_mappings"       ON site_mappings;
DROP POLICY IF EXISTS "Anyone can update site_mappings"       ON site_mappings;
DROP POLICY IF EXISTS "Anyone can delete site_mappings"       ON site_mappings;

ALTER TABLE site_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON site_mappings FROM anon, authenticated;

-- excel_templates ------------------------------------------------------------
-- Same allow-all pattern as the tables above, and arguably the worst of them:
-- these rows define which spreadsheet cell each passport field lands in. Anyone
-- able to rewrite them could silently corrupt filings submitted to CBP and the
-- Coast Guard. Reads happen server-side in /api/excel/generate, so nothing
-- client-side needs access.
DROP POLICY IF EXISTS "Allow read on excel_templates"   ON excel_templates;
DROP POLICY IF EXISTS "Allow insert on excel_templates" ON excel_templates;
DROP POLICY IF EXISTS "Allow update on excel_templates" ON excel_templates;
DROP POLICY IF EXISTS "Allow delete on excel_templates" ON excel_templates;

ALTER TABLE excel_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON excel_templates FROM anon, authenticated;

-- connection_tests -----------------------------------------------------------
-- Demo scaffolding from project setup. Locked down here; scheduled for deletion
-- along with the components that read it.
DROP POLICY IF EXISTS "Anyone can read connection_tests"   ON connection_tests;
DROP POLICY IF EXISTS "Anyone can insert connection_tests" ON connection_tests;
DROP POLICY IF EXISTS "Anyone can delete connection_tests" ON connection_tests;

ALTER TABLE connection_tests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON connection_tests FROM anon, authenticated;

-- SECURITY DEFINER functions -------------------------------------------------
-- These bypass RLS by design, so leaving them executable by anon would reopen
-- exactly the hole this migration closes: anyone could drain a session's images
-- by guessing or observing a session id.
REVOKE ALL ON FUNCTION append_session_image(text, text)        FROM anon, authenticated;
REVOKE ALL ON FUNCTION fetch_and_clear_session_images(text)    FROM anon, authenticated;
REVOKE ALL ON FUNCTION cleanup_expired_sessions()              FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION append_session_image(text, text)     TO service_role;
GRANT EXECUTE ON FUNCTION fetch_and_clear_session_images(text) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_sessions()           TO service_role;
