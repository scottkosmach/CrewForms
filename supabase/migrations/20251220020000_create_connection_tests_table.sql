-- Migration: Create connection_tests table
-- Purpose: Simple test table to validate database connectivity and CRUD operations
-- Date: 2025-12-20

-- ============================================================================
-- CREATE TEST TABLE
-- ============================================================================

CREATE TABLE connection_tests (
  -- Primary key using UUID for distributed systems compatibility
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Test message to verify insert/read operations
  message TEXT NOT NULL,
  
  -- Timestamp for tracking when records were created
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add a comment describing the table's purpose
COMMENT ON TABLE connection_tests IS 'Test table for validating Supabase connectivity';


-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS (required for all tables in Supabase)
ALTER TABLE connection_tests ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read test records (for testing without auth)
CREATE POLICY "Anyone can read connection tests"
  ON connection_tests
  FOR SELECT
  USING (true);

-- Policy: Anyone can insert test records (for testing without auth)
CREATE POLICY "Anyone can insert connection tests"
  ON connection_tests
  FOR INSERT
  WITH CHECK (true);

-- Policy: Anyone can delete test records (for cleanup)
CREATE POLICY "Anyone can delete connection tests"
  ON connection_tests
  FOR DELETE
  USING (true);


-- ============================================================================
-- INITIAL TEST DATA
-- ============================================================================

-- Insert a welcome message to verify the table was created
INSERT INTO connection_tests (message) 
VALUES ('Hello from Supabase! Database connection successful.');

