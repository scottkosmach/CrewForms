/**
 * Field Mappings API
 * 
 * Manages form field mappings for supported websites.
 * Mappings define how passport data maps to form inputs on target sites.
 * 
 * Now uses Supabase for persistent storage instead of in-memory Map.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

interface FieldConfig {
  keypressMap?: Record<string, { key: string; count: number }>;
  format?: string;
}

interface FieldMapping {
  position: number;
  dataSource: string;
  inputType: 'text' | 'select-match' | 'select-keypress' | 'date-text' | 'date-dropdowns' | 'date-picker' | 'radio' | 'checkbox';
  config?: FieldConfig;
}

interface SiteMapping {
  id: string;
  name: string;
  urlPattern: string;
  formType: 'static' | 'dynamic-guest-blocks';
  fields: FieldMapping[];
  createdAt: number;
  updatedAt: number;
  version: number;
}

// Database row type (snake_case)
interface SiteMappingRow {
  id: string;
  name: string;
  url_pattern: string;
  form_type: string;
  fill_delay: number;
  fields: FieldMapping[];
  created_at: string;
  updated_at: string;
  version: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert database row to API response format (camelCase)
 */
function rowToMapping(row: SiteMappingRow): SiteMapping & { fillDelay: number } {
  return {
    id: row.id,
    name: row.name,
    urlPattern: row.url_pattern,
    formType: row.form_type as 'static' | 'dynamic-guest-blocks',
    fillDelay: row.fill_delay ?? 100, // Default 100ms if not set
    fields: row.fields,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    version: row.version
  };
}

/**
 * Check if a URL matches a pattern (supports * wildcards)
 */
function urlMatchesPattern(url: string, pattern: string): boolean {
  // Strip protocol and www. from both URL and pattern so matching works
  // regardless of whether https:// or www. is included
  const normalizeUrl = (s: string) => s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const normalizedUrl = normalizeUrl(url);
  const normalizedPattern = normalizeUrl(pattern);

  // Convert pattern to regex
  // Escape special regex chars except *
  const regexPattern = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(normalizedUrl);
}

/**
 * Generate a mapping ID from URL pattern
 */
function generateMappingId(urlPattern: string): string {
  return urlPattern
    .replace(/https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * GET /api/mappings
 * Get a mapping by URL or list all mappings
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const id = searchParams.get('id');
  
  try {
    const supabase = await createClient();
    
    // Get specific mapping by ID
    if (id) {
      const { data, error } = await supabase
        .from('site_mappings')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error || !data) {
        return NextResponse.json(
          { error: 'Mapping not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(rowToMapping(data));
    }
    
    // Find mapping by URL pattern
    if (url) {
      // Fetch all mappings and check patterns (can't do regex in SQL easily)
      const { data: mappings, error } = await supabase
        .from('site_mappings')
        .select('*');
      
      if (error) {
        console.error('Failed to fetch mappings:', error);
        return NextResponse.json(
          { error: 'Failed to fetch mappings' },
          { status: 500 }
        );
      }
      
      // Find first matching pattern
      const matchingRow = mappings?.find(row => 
        urlMatchesPattern(url, row.url_pattern)
      );
      
      if (!matchingRow) {
        return NextResponse.json(
          { error: 'No mapping found for this URL' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(rowToMapping(matchingRow));
    }
    
    // List all mappings
    const { data: mappings, error } = await supabase
      .from('site_mappings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Failed to fetch mappings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch mappings' },
        { status: 500 }
      );
    }
    
    // Return summary list
    const allMappings = (mappings || []).map(row => ({
      id: row.id,
      name: row.name,
      urlPattern: row.url_pattern,
      formType: row.form_type,
      fieldCount: row.fields?.length || 0,
      version: row.version,
      updatedAt: new Date(row.updated_at).getTime()
    }));
    
    return NextResponse.json({ mappings: allMappings });
    
  } catch (error) {
    console.error('GET /api/mappings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mappings
 * Create a new mapping
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.urlPattern || !body.fields) {
      return NextResponse.json(
        { error: 'Missing required fields: name, urlPattern, fields' },
        { status: 400 }
      );
    }
    
    // Generate ID from URL pattern
    const id = body.id || generateMappingId(body.urlPattern);
    
    const supabase = await createClient();
    
    // Check for duplicate
    const { data: existing } = await supabase
      .from('site_mappings')
      .select('id')
      .eq('id', id)
      .single();
    
    if (existing) {
      return NextResponse.json(
        { error: 'A mapping with this ID already exists' },
        { status: 409 }
      );
    }
    
    // Insert new mapping
    const { data, error } = await supabase
      .from('site_mappings')
      .insert({
        id,
        name: body.name,
        url_pattern: body.urlPattern,
        form_type: body.formType || 'static',
        fill_delay: body.fillDelay ?? 100,
        fields: body.fields,
        version: 1
      })
      .select()
      .single();
    
    if (error) {
      console.error('Failed to create mapping:', error);
      return NextResponse.json(
        { error: 'Failed to create mapping' },
        { status: 500 }
      );
    }
    
    console.log(`Created mapping: ${data.name} (${data.id})`);
    
    return NextResponse.json(rowToMapping(data), { status: 201 });
    
  } catch (error) {
    console.error('POST /api/mappings error:', error);
    return NextResponse.json(
      { error: 'Failed to create mapping' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/mappings
 * Update an existing mapping
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { error: 'Missing mapping ID' },
        { status: 400 }
      );
    }
    
    const supabase = await createClient();
    
    // Check if mapping exists
    const { data: existing, error: fetchError } = await supabase
      .from('site_mappings')
      .select('*')
      .eq('id', body.id)
      .single();
    
    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Mapping not found' },
        { status: 404 }
      );
    }
    
    // Update mapping
    const { data, error } = await supabase
      .from('site_mappings')
      .update({
        name: body.name || existing.name,
        url_pattern: body.urlPattern || existing.url_pattern,
        form_type: body.formType || existing.form_type,
        fill_delay: body.fillDelay ?? existing.fill_delay ?? 100,
        fields: body.fields || existing.fields,
        updated_at: new Date().toISOString(),
        version: existing.version + 1
      })
      .eq('id', body.id)
      .select()
      .single();
    
    if (error) {
      console.error('Failed to update mapping:', error);
      return NextResponse.json(
        { error: 'Failed to update mapping' },
        { status: 500 }
      );
    }
    
    console.log(`Updated mapping: ${data.name} (v${data.version})`);
    
    return NextResponse.json(rowToMapping(data));
    
  } catch (error) {
    console.error('PUT /api/mappings error:', error);
    return NextResponse.json(
      { error: 'Failed to update mapping' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mappings
 * Delete a mapping
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  if (!id) {
    return NextResponse.json(
      { error: 'Missing mapping ID' },
      { status: 400 }
    );
  }
  
  try {
    const supabase = await createClient();
    
    // Check if mapping exists
    const { data: existing } = await supabase
      .from('site_mappings')
      .select('id')
      .eq('id', id)
      .single();
    
    if (!existing) {
      return NextResponse.json(
        { error: 'Mapping not found' },
        { status: 404 }
      );
    }
    
    // Delete mapping
    const { error } = await supabase
      .from('site_mappings')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Failed to delete mapping:', error);
      return NextResponse.json(
        { error: 'Failed to delete mapping' },
        { status: 500 }
      );
    }
    
    console.log(`Deleted mapping: ${id}`);
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('DELETE /api/mappings error:', error);
    return NextResponse.json(
      { error: 'Failed to delete mapping' },
      { status: 500 }
    );
  }
}

// ============================================================================
// EXPORT HELPERS FOR TESTING
// ============================================================================

export { urlMatchesPattern };
