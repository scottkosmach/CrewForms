/**
 * Excel Template Upload API
 * 
 * Handles uploading blank Excel template files to Supabase Storage.
 * Returns the file path that can be stored in the excel_templates table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApiUser, isAdmin, forbiddenResponse } from '@/lib/api-auth';

// Valid MIME types for Excel files
const VALID_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * POST /api/excel-templates/upload
 * Upload a blank Excel template file
 * 
 * Request: FormData with 'file' field
 * Response: { path: string } - the storage path for use in template creation
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  if (!isAdmin(auth.user)) return forbiddenResponse();

  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Validate file type
    if (!VALID_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only Excel files (.xlsx, .xls) are allowed.' },
        { status: 400 }
      );
    }
    
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }
    
    // Generate unique file path
    // Use timestamp + original filename for uniqueness
    const timestamp = Date.now();
    const safeName = file.name
      .replace(/[^a-zA-Z0-9.-]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
    const filePath = `${timestamp}-${safeName}`;
    
    // Get file content as ArrayBuffer then convert to Blob
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });
    
    // Upload to Supabase Storage
    const supabase = createAdminClient();
    
    const { data, error } = await supabase.storage
      .from('templates')
      .upload(filePath, blob, {
        contentType: file.type,
        upsert: false
      });
    
    if (error) {
      console.error('Failed to upload template file:', error);
      return NextResponse.json(
        { error: `Failed to upload file: ${error.message}` },
        { status: 500 }
      );
    }
    
    console.log(`Uploaded template file: ${data.path}`);
    
    return NextResponse.json({
      path: data.path,
      fullPath: data.fullPath || data.path,
      originalName: file.name,
      size: file.size
    });
    
  } catch (error) {
    console.error('POST /api/excel-templates/upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/excel-templates/upload
 * Delete a template file from storage
 * 
 * Query params:
 * - path: File path in storage (required)
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  if (!isAdmin(auth.user)) return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  
  if (!path) {
    return NextResponse.json(
      { error: 'Missing file path' },
      { status: 400 }
    );
  }
  
  try {
    const supabase = createAdminClient();
    
    const { error } = await supabase.storage
      .from('templates')
      .remove([path]);
    
    if (error) {
      console.error('Failed to delete template file:', error);
      return NextResponse.json(
        { error: `Failed to delete file: ${error.message}` },
        { status: 500 }
      );
    }
    
    console.log(`Deleted template file: ${path}`);
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('DELETE /api/excel-templates/upload error:', error);
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}

