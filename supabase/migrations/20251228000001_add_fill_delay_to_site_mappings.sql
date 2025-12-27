-- ============================================================================
-- Add fill_delay column to site_mappings table
-- ============================================================================
-- Adds a configurable delay (in milliseconds) between filling each form field.
-- This is important for Angular/React forms that need time to process changes.
-- ============================================================================

ALTER TABLE site_mappings 
ADD COLUMN IF NOT EXISTS fill_delay INTEGER DEFAULT 100;

COMMENT ON COLUMN site_mappings.fill_delay IS 'Delay in milliseconds between filling each form field (default 100ms for Angular/React forms).';

