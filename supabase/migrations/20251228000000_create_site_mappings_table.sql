-- ============================================================================
-- Site Mappings Table
-- ============================================================================
-- Stores form field mappings for supported websites.
-- Mappings define how passport data maps to form inputs on target sites.
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_mappings (
  -- Unique mapping ID (generated from URL pattern)
  id TEXT PRIMARY KEY,
  
  -- Human-readable name for the mapping
  name TEXT NOT NULL,
  
  -- URL pattern with wildcards (e.g., https://sailclear.com/*)
  url_pattern TEXT NOT NULL,
  
  -- Form type: 'static' or 'dynamic-guest-blocks'
  form_type TEXT DEFAULT 'static' NOT NULL,
  
  -- Field mappings as JSON array
  -- Each field has: position, dataSource, inputType, config (optional)
  fields JSONB NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Version for optimistic locking
  version INTEGER DEFAULT 1 NOT NULL
);

-- Index for efficient URL pattern lookups
CREATE INDEX IF NOT EXISTS idx_site_mappings_url_pattern 
  ON site_mappings(url_pattern);

-- Enable Row Level Security
ALTER TABLE site_mappings ENABLE ROW LEVEL SECURITY;

-- Allow all operations (mappings are public by design)
-- In production, you might want to restrict write access to admins
-- Using DO block to handle "already exists" case gracefully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to site_mappings'
  ) THEN
    CREATE POLICY "Allow read access to site_mappings"
      ON site_mappings
      FOR SELECT
      USING (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow insert on site_mappings'
  ) THEN
    CREATE POLICY "Allow insert on site_mappings"
      ON site_mappings
      FOR INSERT
      WITH CHECK (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow update on site_mappings'
  ) THEN
    CREATE POLICY "Allow update on site_mappings"
      ON site_mappings
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow delete on site_mappings'
  ) THEN
    CREATE POLICY "Allow delete on site_mappings"
      ON site_mappings
      FOR DELETE
      USING (true);
  END IF;
END $$;

-- Comment for documentation
COMMENT ON TABLE site_mappings IS 'Form field mappings for auto-filling passport data on supported websites.';
COMMENT ON COLUMN site_mappings.url_pattern IS 'URL pattern with wildcards (e.g., https://example.com/*) for matching pages.';
COMMENT ON COLUMN site_mappings.fields IS 'JSON array of field mappings with position, dataSource, inputType, and optional config.';

