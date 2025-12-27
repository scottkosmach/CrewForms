/**
 * Session Upload API
 * 
 * Receives images uploaded from mobile devices and queues them for relay.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, addImageToSession } from '../../route';

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * POST /api/sessions/[sessionId]/upload
 * Upload one or more images to a session
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  
  // Verify session exists
  const session = getSession(sessionId);
  
  if (!session) {
    return NextResponse.json(
      { error: 'Session not found or expired' },
      { status: 404 }
    );
  }
  
  // Check if session has expired
  if (session.expiresAt < Date.now()) {
    return NextResponse.json(
      { error: 'Session has expired' },
      { status: 410 }
    );
  }
  
  try {
    const contentType = request.headers.get('content-type') || '';
    
    // Handle multipart form data (file uploads)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const files = formData.getAll('images') as File[];
      
      if (files.length === 0) {
        return NextResponse.json(
          { error: 'No images provided' },
          { status: 400 }
        );
      }
      
      const uploadedCount = await processFiles(sessionId, files);
      
      return NextResponse.json({
        success: true,
        uploaded: uploadedCount,
        message: `${uploadedCount} image(s) uploaded successfully`
      });
    }
    
    // Handle JSON body with base64 images
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const images = body.images as string[];
      
      if (!images || images.length === 0) {
        return NextResponse.json(
          { error: 'No images provided' },
          { status: 400 }
        );
      }
      
      let uploadedCount = 0;
      for (const imageData of images) {
        if (addImageToSession(sessionId, imageData)) {
          uploadedCount++;
        }
      }
      
      return NextResponse.json({
        success: true,
        uploaded: uploadedCount,
        message: `${uploadedCount} image(s) uploaded successfully`
      });
    }
    
    return NextResponse.json(
      { error: 'Unsupported content type' },
      { status: 415 }
    );
    
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Process uploaded files and add to session
 */
async function processFiles(sessionId: string, files: File[]): Promise<number> {
  let uploadedCount = 0;
  
  for (const file of files) {
    try {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        console.warn(`Skipping non-image file: ${file.name}`);
        continue;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        console.warn(`Skipping large file: ${file.name} (${file.size} bytes)`);
        continue;
      }
      
      // Convert to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const dataUrl = `data:${file.type};base64,${base64}`;
      
      // Add to session
      if (addImageToSession(sessionId, dataUrl)) {
        uploadedCount++;
        console.log(`Uploaded image ${file.name} to session ${sessionId}`);
      }
      
    } catch (error) {
      console.error(`Failed to process file ${file.name}:`, error);
    }
  }
  
  return uploadedCount;
}

/**
 * Route segment config for large uploads
 * https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
 */
export const maxDuration = 60; // Allow up to 60 seconds for uploads
export const dynamic = 'force-dynamic';

