-- ============================================================================
-- Upload Sessions Table
-- ============================================================================
-- Stores temporary upload sessions for QR code-based image transfer.
-- Sessions are short-lived (5 minutes) and cleaned up automatically.
-- ============================================================================

CREATE TABLE IF NOT EXISTS upload_sessions (
  -- Unique session ID (nanoid format)
  id TEXT PRIMARY KEY,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Image data (array of base64 strings waiting to be relayed)
  images JSONB DEFAULT '[]'::jsonb NOT NULL,
  
  -- Connection status (is extension connected via SSE?)
  connected BOOLEAN DEFAULT FALSE NOT NULL
);

-- Index for efficient expiry cleanup
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires_at 
  ON upload_sessions(expires_at);

-- Enable Row Level Security
ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;

-- Allow all operations (sessions are temporary and public by design)
-- The session ID itself acts as the security token
CREATE POLICY "Allow all operations on upload_sessions"
  ON upload_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Automatic Cleanup Function
-- ============================================================================
-- Deletes expired sessions. Can be called periodically via cron or pg_cron.

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM upload_sessions
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Comment for documentation
COMMENT ON TABLE upload_sessions IS 'Temporary upload sessions for QR code-based passport image transfer. Sessions expire after 5 minutes.';
COMMENT ON FUNCTION cleanup_expired_sessions IS 'Removes expired upload sessions. Call periodically to clean up old data.';

