/**
 * Excel Templates API
 * 
 * Manages Excel template configurations for generating filled spreadsheets.
 * Templates are associated with sites via URL patterns and contain
 * multi-sheet column mappings.
 * 
 * Uses Supabase for template metadata and Storage for template files.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Column mapping for a single cell or column in the Excel sheet
 */
interface ColumnMapping {
  col: string;           // Column letter (e.g., 'C', 'D')
  row?: number;          // Fixed row for 'single' dataType
  source: string;        // Data source path (e.g., 'traveler.lastName')
  required?: boolean;    // Whether the field is required
  format?: string;       // Date format (e.g., 'YYYY-MM-DD')
  valueMap?: Record<string, string>;  // Value transformations (e.g., { "M": "Male" })
}

/**
 * Sheet configuration within an Excel template
 */
interface SheetConfig {
  sheetName: string;     // Name of the worksheet
  startRow: number;      // Starting row for data (1-based)
  dataType: 'travelers' | 'crew' | 'single';  // How data is populated
  columns: ColumnMapping[];
}

/**
 * Database row type (snake_case)
 */
interface ExcelTemplateRow {
  id: string;
  name: string;
  url_pattern: string;
  description: string | null;
  template_path: string;
  sheets: SheetConfig[];
  created_at: string;
  updated_at: string;
  version: number;
}

/**
 * API response type (camelCase)
 */
interface ExcelTemplate {
  id: string;
  name: string;
  urlPattern: string;
  description: string | null;
  templatePath: string;
  sheets: SheetConfig[];
  createdAt: number;
  updatedAt: number;
  version: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert database row to API response format (camelCase)
 */
function rowToTemplate(row: ExcelTemplateRow): ExcelTemplate {
  return {
    id: row.id,
    name: row.name,
    urlPattern: row.url_pattern,
    description: row.description,
    templatePath: row.template_path,
    sheets: row.sheets || [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    version: row.version
  };
}

/**
 * Check if a URL matches a pattern (supports * wildcards)
 */
function urlMatchesPattern(url: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(url);
}

/**
 * Generate a template ID from URL pattern
 */
function generateTemplateId(urlPattern: string): string {
  return 'excel-' + urlPattern
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
 * GET /api/excel-templates
 * Get a template by URL, by ID, or list all templates
 * 
 * Query params:
 * - url: Find template matching this URL
 * - id: Get template by ID
 * - (none): List all templates
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const id = searchParams.get('id');
  
  try {
    const supabase = await createClient();
    
    // Get specific template by ID
    if (id) {
      const { data, error } = await supabase
        .from('excel_templates')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error || !data) {
        return NextResponse.json(
          { error: 'Template not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(rowToTemplate(data));
    }
    
    // Find template by URL pattern
    if (url) {
      const { data: templates, error } = await supabase
        .from('excel_templates')
        .select('*');
      
      if (error) {
        console.error('Failed to fetch templates:', error);
        return NextResponse.json(
          { error: 'Failed to fetch templates' },
          { status: 500 }
        );
      }
      
      // Find first matching pattern
      const matchingRow = templates?.find(row => 
        urlMatchesPattern(url, row.url_pattern)
      );
      
      if (!matchingRow) {
        return NextResponse.json(
          { error: 'No template found for this URL' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(rowToTemplate(matchingRow));
    }
    
    // List all templates
    const { data: templates, error } = await supabase
      .from('excel_templates')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Failed to fetch templates:', error);
      return NextResponse.json(
        { error: 'Failed to fetch templates' },
        { status: 500 }
      );
    }
    
    // Return summary list
    const allTemplates = (templates || []).map(row => ({
      id: row.id,
      name: row.name,
      urlPattern: row.url_pattern,
      description: row.description,
      templatePath: row.template_path,
      sheetCount: row.sheets?.length || 0,
      version: row.version,
      updatedAt: new Date(row.updated_at).getTime()
    }));
    
    return NextResponse.json({ templates: allTemplates });
    
  } catch (error) {
    console.error('GET /api/excel-templates error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/excel-templates
 * Create a new template
 * 
 * Body (JSON):
 * - name: Template name (required)
 * - urlPattern: URL pattern with wildcards (required)
 * - description: Optional description
 * - templatePath: Path to template file in storage (required)
 * - sheets: Array of sheet configurations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.urlPattern || !body.templatePath) {
      return NextResponse.json(
        { error: 'Missing required fields: name, urlPattern, templatePath' },
        { status: 400 }
      );
    }
    
    // Generate ID from URL pattern
    const id = body.id || generateTemplateId(body.urlPattern);
    
    const supabase = await createClient();
    
    // Check for duplicate
    const { data: existing } = await supabase
      .from('excel_templates')
      .select('id')
      .eq('id', id)
      .single();
    
    if (existing) {
      return NextResponse.json(
        { error: 'A template with this ID already exists' },
        { status: 409 }
      );
    }
    
    // Insert new template
    const { data, error } = await supabase
      .from('excel_templates')
      .insert({
        id,
        name: body.name,
        url_pattern: body.urlPattern,
        description: body.description || null,
        template_path: body.templatePath,
        sheets: body.sheets || [],
        version: 1
      })
      .select()
      .single();
    
    if (error) {
      console.error('Failed to create template:', error);
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }
    
    console.log(`Created Excel template: ${data.name} (${data.id})`);
    
    return NextResponse.json(rowToTemplate(data), { status: 201 });
    
  } catch (error) {
    console.error('POST /api/excel-templates error:', error);
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/excel-templates
 * Update an existing template
 * 
 * Body (JSON):
 * - id: Template ID (required)
 * - name, urlPattern, description, templatePath, sheets: Fields to update
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { error: 'Missing template ID' },
        { status: 400 }
      );
    }
    
    const supabase = await createClient();
    
    // Check if template exists
    const { data: existing, error: fetchError } = await supabase
      .from('excel_templates')
      .select('*')
      .eq('id', body.id)
      .single();
    
    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }
    
    // Update template
    const { data, error } = await supabase
      .from('excel_templates')
      .update({
        name: body.name || existing.name,
        url_pattern: body.urlPattern || existing.url_pattern,
        description: body.description !== undefined ? body.description : existing.description,
        template_path: body.templatePath || existing.template_path,
        sheets: body.sheets || existing.sheets,
        updated_at: new Date().toISOString(),
        version: existing.version + 1
      })
      .eq('id', body.id)
      .select()
      .single();
    
    if (error) {
      console.error('Failed to update template:', error);
      return NextResponse.json(
        { error: 'Failed to update template' },
        { status: 500 }
      );
    }
    
    console.log(`Updated Excel template: ${data.name} (v${data.version})`);
    
    return NextResponse.json(rowToTemplate(data));
    
  } catch (error) {
    console.error('PUT /api/excel-templates error:', error);
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/excel-templates
 * Delete a template and its associated file
 * 
 * Query params:
 * - id: Template ID (required)
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  if (!id) {
    return NextResponse.json(
      { error: 'Missing template ID' },
      { status: 400 }
    );
  }
  
  try {
    const supabase = await createClient();
    
    // Get template to find the file path
    const { data: existing } = await supabase
      .from('excel_templates')
      .select('*')
      .eq('id', id)
      .single();
    
    if (!existing) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }
    
    // Delete the template file from storage (if it exists)
    if (existing.template_path) {
      const { error: storageError } = await supabase.storage
        .from('templates')
        .remove([existing.template_path]);
      
      if (storageError) {
        console.warn(`Warning: Failed to delete template file: ${storageError.message}`);
        // Continue with template deletion even if file deletion fails
      }
    }
    
    // Delete template record
    const { error } = await supabase
      .from('excel_templates')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Failed to delete template:', error);
      return NextResponse.json(
        { error: 'Failed to delete template' },
        { status: 500 }
      );
    }
    
    console.log(`Deleted Excel template: ${id}`);
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('DELETE /api/excel-templates error:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { urlMatchesPattern };

