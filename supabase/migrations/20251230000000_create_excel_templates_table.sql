-- ============================================================================
-- Excel Templates Table
-- ============================================================================
-- Stores Excel template configurations for generating filled spreadsheets.
-- Each template is associated with a site (via URL pattern) and contains
-- multi-sheet column mappings for populating data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS excel_templates (
  -- Unique template ID (e.g., 'cbp-i418')
  id TEXT PRIMARY KEY,
  
  -- Human-readable name for the template
  name TEXT NOT NULL,
  
  -- URL pattern with wildcards (e.g., https://cbp.gov/*)
  -- Used to match which template applies to which site
  url_pattern TEXT NOT NULL,
  
  -- Optional description of the template
  description TEXT,
  
  -- Path to the blank template file in Supabase Storage (templates bucket)
  -- e.g., 'cbp-i418-blank.xlsx'
  template_path TEXT NOT NULL,
  
  -- Multi-sheet configuration as JSONB array
  -- Structure:
  -- [
  --   {
  --     "sheetName": "Non-Crew List",
  --     "startRow": 8,
  --     "dataType": "travelers",  -- 'travelers' | 'crew' | 'single'
  --     "columns": [
  --       { "col": "C", "source": "traveler.lastName", "required": true },
  --       { "col": "D", "source": "traveler.firstName", "required": true },
  --       { "col": "F", "source": "traveler.dateOfBirth", "format": "YYYY-MM-DD" },
  --       { "col": "G", "source": "traveler.gender", "valueMap": {"M": "Male", "F": "Female"} }
  --     ]
  --   },
  --   {
  --     "sheetName": "Vessel Info",
  --     "startRow": 3,
  --     "dataType": "single",
  --     "columns": [
  --       { "col": "B", "row": 3, "source": "boat.vesselName" },
  --       { "col": "B", "row": 4, "source": "captain.lastName" }
  --     ]
  --   }
  -- ]
  sheets JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Version for optimistic locking
  version INTEGER DEFAULT 1 NOT NULL
);

-- Index for efficient URL pattern lookups
CREATE INDEX IF NOT EXISTS idx_excel_templates_url_pattern 
  ON excel_templates(url_pattern);

-- Enable Row Level Security
ALTER TABLE excel_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies (similar to site_mappings - public read, admin write in production)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to excel_templates'
  ) THEN
    CREATE POLICY "Allow read access to excel_templates"
      ON excel_templates
      FOR SELECT
      USING (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow insert on excel_templates'
  ) THEN
    CREATE POLICY "Allow insert on excel_templates"
      ON excel_templates
      FOR INSERT
      WITH CHECK (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow update on excel_templates'
  ) THEN
    CREATE POLICY "Allow update on excel_templates"
      ON excel_templates
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow delete on excel_templates'
  ) THEN
    CREATE POLICY "Allow delete on excel_templates"
      ON excel_templates
      FOR DELETE
      USING (true);
  END IF;
END $$;

-- Comment for documentation
COMMENT ON TABLE excel_templates IS 'Excel template configurations for generating filled spreadsheets from passport/travel data.';
COMMENT ON COLUMN excel_templates.url_pattern IS 'URL pattern with wildcards for matching which site this template applies to.';
COMMENT ON COLUMN excel_templates.template_path IS 'Path to blank .xlsx template file in Supabase Storage templates bucket.';
COMMENT ON COLUMN excel_templates.sheets IS 'JSONB array of sheet configurations with column mappings.';

