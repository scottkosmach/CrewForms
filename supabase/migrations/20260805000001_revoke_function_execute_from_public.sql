-- Actually revoke EXECUTE on the SECURITY DEFINER relay functions.
--
-- The previous migration revoked from anon and authenticated, which verified as
-- insufficient: Postgres grants EXECUTE on new functions to PUBLIC by default,
-- and anon inherits that. So after locking the tables down, this still returned
-- HTTP 200 to a caller holding only the public anon key:
--
--   POST /rest/v1/rpc/fetch_and_clear_session_images  {"p_session_id": "..."}
--
-- Because these functions are SECURITY DEFINER they bypass RLS, so that call
-- was a complete bypass of both the table lockdown and the API-level session
-- check — and since the function clears the queue, it would also destroy the
-- captain's images on the way out.
--
-- Revoking from PUBLIC is the part that actually closes it.

REVOKE ALL ON FUNCTION append_session_image(text, text)     FROM PUBLIC;
REVOKE ALL ON FUNCTION fetch_and_clear_session_images(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cleanup_expired_sessions()           FROM PUBLIC;

-- Re-assert the intended grant. The API routes reach these through the service
-- role key, which is the only identity that should be able to move images.
GRANT EXECUTE ON FUNCTION append_session_image(text, text)     TO service_role;
GRANT EXECUTE ON FUNCTION fetch_and_clear_session_images(text) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_sessions()           TO service_role;
