-- ============================================================================
-- Seed Data for CrewForms
-- ============================================================================
-- Run with: supabase db seed
-- Or manually via SQL editor in Supabase Dashboard
-- ============================================================================

-- Example site mappings for demonstration
-- These show different input types and configurations

INSERT INTO site_mappings (id, name, url_pattern, form_type, fields, version)
VALUES (
  'example-port-authority',
  'Example Port Authority',
  'https://portauthority.example.gov/*',
  'dynamic-guest-blocks',
  '[
    {"position": 1, "dataSource": "traveler.firstName", "inputType": "text"},
    {"position": 2, "dataSource": "traveler.middleName", "inputType": "text"},
    {"position": 3, "dataSource": "traveler.lastName", "inputType": "text"},
    {"position": 4, "dataSource": "traveler.passportNumber", "inputType": "text"},
    {"position": 5, "dataSource": "traveler.dateOfBirth.month", "inputType": "select-match"},
    {"position": 6, "dataSource": "traveler.dateOfBirth.day", "inputType": "select-match"},
    {"position": 7, "dataSource": "traveler.dateOfBirth.year", "inputType": "select-match"},
    {"position": 8, "dataSource": "traveler.gender", "inputType": "radio"},
    {"position": 9, "dataSource": "traveler.nationality", "inputType": "select-keypress", "config": {"keypressMap": {"United States": {"key": "U", "count": 4}, "United Kingdom": {"key": "U", "count": 5}, "Canada": {"key": "C", "count": 2}, "Australia": {"key": "A", "count": 2}}}},
    {"position": 10, "dataSource": "traveler.dateOfExpiry", "inputType": "date-text", "config": {"format": "MM/DD/YYYY"}}
  ]'::jsonb,
  1
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO site_mappings (id, name, url_pattern, form_type, fields, version)
VALUES (
  'example-boat-registry',
  'Example Boat Registry',
  'https://boats.example.gov/*',
  'static',
  '[
    {"position": 1, "dataSource": "boat.vesselName", "inputType": "text"},
    {"position": 2, "dataSource": "boat.registrationNumber", "inputType": "text"},
    {"position": 3, "dataSource": "boat.flagState", "inputType": "select-match"},
    {"position": 4, "dataSource": "boat.homePort", "inputType": "text"},
    {"position": 5, "dataSource": "boat.vesselType", "inputType": "select-match"},
    {"position": 6, "dataSource": "boat.capacity", "inputType": "text"},
    {"position": 7, "dataSource": "captain.firstName", "inputType": "text"},
    {"position": 8, "dataSource": "captain.lastName", "inputType": "text"},
    {"position": 9, "dataSource": "captain.licenseNumber", "inputType": "text"}
  ]'::jsonb,
  1
)
ON CONFLICT (id) DO NOTHING;

-- Add more mappings here as needed
-- Example for a real site (sailclear.com) - you'll create this via the admin panel

