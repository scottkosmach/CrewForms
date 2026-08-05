-- ============================================================================
-- Atomic Image Relay Functions
-- ============================================================================
-- Fixes race conditions in the image upload/relay pipeline by using
-- PostgreSQL row-level locking and atomic operations.
--
-- Problem: The read-modify-write pattern in addImageToSession() and the
-- separate read-then-clear in getPendingImages() caused images to be
-- silently dropped under concurrent access.
-- ============================================================================

-- Function 1: Atomic append
-- Replaces the non-atomic read-modify-write pattern in addImageToSession().
-- Uses JSONB concatenation (||) in a single UPDATE — no separate read step.
-- PostgreSQL acquires a row-level lock for the UPDATE, so concurrent appends
-- serialize properly.
CREATE OR REPLACE FUNCTION append_session_image(p_session_id text, p_image_data text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE upload_sessions
  SET images = images || jsonb_build_array(p_image_data)
  WHERE id = p_session_id
    AND expires_at > now();

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;

COMMENT ON FUNCTION append_session_image IS 'Atomically appends an image to a session''s images array. Prevents lost updates from concurrent appends.';

-- Function 2: Atomic fetch-and-clear
-- Replaces the separate read-then-clear pattern in getPendingImages().
-- Uses SELECT ... FOR UPDATE to acquire an exclusive row lock, reads the
-- current images, clears them, and returns the snapshot — all within a
-- single implicit transaction. No image can be lost between read and clear.
CREATE OR REPLACE FUNCTION fetch_and_clear_session_images(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Lock the row to prevent concurrent modifications
  SELECT images INTO result
  FROM upload_sessions
  WHERE id = p_session_id
    AND expires_at > now()
  FOR UPDATE;

  -- If no valid session found, return empty array
  IF result IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Only clear if there are images to clear
  IF jsonb_array_length(result) > 0 THEN
    UPDATE upload_sessions
    SET images = '[]'::jsonb
    WHERE id = p_session_id;
  END IF;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION fetch_and_clear_session_images IS 'Atomically fetches and clears all pending images from a session. Uses row-level locking to prevent race conditions with concurrent appends.';
