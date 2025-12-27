/**
 * Session Detail API
 * 
 * Get session status and connect via SSE for real-time image relay.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getPendingImages, setSessionConnected, deleteSession } from '../route';

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * GET /api/sessions/[sessionId]
 * Get session status or establish SSE connection
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);
  
  if (!session) {
    return NextResponse.json(
      { error: 'Session not found or expired' },
      { status: 404 }
    );
  }
  
  // Check if SSE connection is requested
  const acceptHeader = request.headers.get('accept');
  if (acceptHeader?.includes('text/event-stream')) {
    return handleSSE(sessionId, request);
  }
  
  // Return session status
  const expiresAtMs = new Date(session.expires_at).getTime();
  
  return NextResponse.json({
    id: session.id,
    expiresAt: expiresAtMs,
    imageCount: session.images.length,
    connected: session.connected,
    timeRemaining: Math.max(0, expiresAtMs - Date.now())
  });
}

/**
 * DELETE /api/sessions/[sessionId]
 * Delete a session
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  await deleteSession(sessionId);
  
  return NextResponse.json({ success: true });
}

// ============================================================================
// SSE HANDLER
// ============================================================================

/**
 * Handle Server-Sent Events connection for image relay
 */
function handleSSE(sessionId: string, request: NextRequest): Response {
  // Create readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      console.log(`SSE connection started for session ${sessionId}`);
      await setSessionConnected(sessionId, true);
      
      // Send initial connection confirmation
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`));
      
      // Poll for new images every 2 seconds (reduced frequency for Supabase)
      const intervalId = setInterval(async () => {
        try {
          const currentSession = await getSession(sessionId);
          
          // Check if session still exists
          if (!currentSession) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'session_expired' })}\n\n`));
            clearInterval(intervalId);
            controller.close();
            return;
          }
          
          // Check for pending images
          const images = await getPendingImages(sessionId);
          
          for (const imageData of images) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'image', data: imageData })}\n\n`));
          }
          
          // Send heartbeat to keep connection alive
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          
        } catch (error) {
          console.error('SSE polling error:', error);
        }
      }, 2000);
      
      // Clean up on close
      request.signal?.addEventListener('abort', async () => {
        console.log(`SSE connection closed for session ${sessionId}`);
        clearInterval(intervalId);
        await setSessionConnected(sessionId, false);
      });
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
