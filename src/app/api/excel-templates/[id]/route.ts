/**
 * Excel Template Single Item API
 * 
 * Handles operations on individual Excel templates by ID.
 * Provides GET, PUT, DELETE operations for a specific template.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApiUser, isAdmin, forbiddenResponse } from '@/lib/api-auth';

// ============================================================================
// TYPES
// ============================================================================

interface ColumnMapping {
  col: string;
  row?: number;
  source: string;
  required?: boolean;
  format?: string;
  valueMap?: Record<string, string>;
}

interface SheetConfig {
  sheetName: string;
  startRow: number;
  dataType: 'travelers' | 'crew' | 'single';
  columns: ColumnMapping[];
}

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

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * GET /api/excel-templates/[id]
 * Get a specific template by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await params;

  try {
    const supabase = createAdminClient();
    
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
    
  } catch (error) {
    console.error(`GET /api/excel-templates/${id} error:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/excel-templates/[id]
 * Update a specific template
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  if (!isAdmin(auth.user)) return forbiddenResponse();

  const { id } = await params;

  try {
    const body = await request.json();
    const supabase = createAdminClient();
    
    // Check if template exists
    const { data: existing, error: fetchError } = await supabase
      .from('excel_templates')
      .select('*')
      .eq('id', id)
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
        sheets: body.sheets !== undefined ? body.sheets : existing.sheets,
        updated_at: new Date().toISOString(),
        version: existing.version + 1
      })
      .eq('id', id)
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
    console.error(`PUT /api/excel-templates/${id} error:`, error);
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/excel-templates/[id]
 * Delete a specific template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  if (!isAdmin(auth.user)) return forbiddenResponse();

  const { id } = await params;

  try {
    const supabase = createAdminClient();

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
    
    // Delete the template file from storage
    if (existing.template_path) {
      const { error: storageError } = await supabase.storage
        .from('templates')
        .remove([existing.template_path]);
      
      if (storageError) {
        console.warn(`Warning: Failed to delete template file: ${storageError.message}`);
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
    console.error(`DELETE /api/excel-templates/${id} error:`, error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}

