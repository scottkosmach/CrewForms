/**
 * Session Images API
 * 
 * Retrieves and clears pending images from a session.
 * Used by the extension to poll for uploaded passport images.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPendingImages, getSession } from '../../route';

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * GET /api/sessions/[sessionId]/images
 * Get and clear all pending images from the session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  
  console.log(`[Images API] GET request for session ${sessionId}`);
  
  // Verify session exists
  const session = await getSession(sessionId);
  
  if (!session) {
    console.log(`[Images API] Session ${sessionId} not found or expired`);
    return NextResponse.json(
      { error: 'Session not found or expired' },
      { status: 404 }
    );
  }
  
  console.log(`[Images API] Session ${sessionId} found, images in session: ${session.images.length}`);
  
  // Get and clear pending images
  const images = await getPendingImages(sessionId);
  
  console.log(`[Images API] Returning ${images.length} images from session ${sessionId}`);
  
  // Log first 100 chars of each image for debugging
  images.forEach((img, i) => {
    console.log(`[Images API] Image ${i + 1}: ${img.substring(0, 100)}...`);
  });
  
  return NextResponse.json({
    images,
    count: images.length
  });
}

export const dynamic = 'force-dynamic';

