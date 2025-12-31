-- ============================================================================
-- Templates Storage Bucket
-- ============================================================================
-- Creates a storage bucket for blank Excel templates.
-- Templates are uploaded via admin and downloaded when generating filled Excel files.
-- ============================================================================

-- Create the 'templates' bucket for storing blank Excel template files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'templates',
  'templates',
  false,  -- Not public, accessed through signed URLs or authenticated requests
  10485760,  -- 10MB limit (Excel files are typically small)
  ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects (should already be enabled, but ensure it)
-- Note: storage.objects RLS is typically pre-configured in Supabase

-- Policy: Allow authenticated users to read template files
-- This allows the API to download templates for generation
CREATE POLICY "Allow authenticated read access to templates"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'templates');

-- Policy: Allow authenticated users to upload template files
-- In production, you might want to restrict this to admin users only
CREATE POLICY "Allow authenticated insert to templates"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'templates');

-- Policy: Allow authenticated users to update template files
CREATE POLICY "Allow authenticated update to templates"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'templates')
  WITH CHECK (bucket_id = 'templates');

-- Policy: Allow authenticated users to delete template files
CREATE POLICY "Allow authenticated delete from templates"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'templates');

