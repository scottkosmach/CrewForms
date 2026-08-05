/**
 * Session Images API
 * 
 * Retrieves and clears pending images from a session.
 * Used by the extension to poll for uploaded passport images.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPendingImages, sessionExists } from '../../route';

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

  // Reject unknown or expired sessions explicitly. This endpoint used to return
  // an empty array for any id, which made it a free oracle: probe ids, and any
  // that were live could be drained on the next call. A 404 stops the probing,
  // and the RPC still enforces expiry itself for the race between the two.
  if (!(await sessionExists(sessionId))) {
    return NextResponse.json(
      { error: 'Session not found or expired' },
      { status: 404 }
    );
  }

  // Atomically fetch and clear pending images
  // The RPC function handles session validation and row-level locking internally
  const images = await getPendingImages(sessionId);

  return NextResponse.json({
    images,
    count: images.length
  });
}

export const dynamic = 'force-dynamic';

