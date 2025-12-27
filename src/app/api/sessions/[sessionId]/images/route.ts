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
  
  // Verify session exists
  const session = await getSession(sessionId);
  
  if (!session) {
    return NextResponse.json(
      { error: 'Session not found or expired' },
      { status: 404 }
    );
  }
  
  // Get and clear pending images
  const images = await getPendingImages(sessionId);
  
  console.log(`Returning ${images.length} images from session ${sessionId}`);
  
  return NextResponse.json({
    images,
    count: images.length
  });
}

export const dynamic = 'force-dynamic';

