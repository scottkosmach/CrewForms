/**
 * Session Images API
 * 
 * Retrieves and clears pending images from a session.
 * Used by the extension to poll for uploaded passport images.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPendingImages } from '../../route';

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

  // Atomically fetch and clear pending images
  // The RPC function handles session validation and row-level locking internally
  const images = await getPendingImages(sessionId);

  console.log(`[Images API] Returning ${images.length} images from session ${sessionId}`);

  return NextResponse.json({
    images,
    count: images.length
  });
}

export const dynamic = 'force-dynamic';

