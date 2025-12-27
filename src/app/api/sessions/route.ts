/**
 * Session Management API
 * 
 * Creates and manages upload sessions for QR code-based image transfer.
 * Sessions are short-lived (5 minutes) and stored in memory.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

// ============================================================================
// TYPES
// ============================================================================

interface Session {
  id: string;
  createdAt: number;
  expiresAt: number;
  images: string[];  // Base64 images waiting to be relayed
  connected: boolean; // Is extension connected via SSE?
}

// ============================================================================
// IN-MEMORY SESSION STORAGE
// ============================================================================

// In production, use Redis or similar
const sessions = new Map<string, Session>();

// Session expiry time (5 minutes)
const SESSION_EXPIRY_MS = 5 * 60 * 1000;

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(id);
      console.log(`Session ${id} expired and removed`);
    }
  }
}, 60 * 1000); // Check every minute

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * POST /api/sessions
 * Create a new upload session
 */
export async function POST(request: NextRequest) {
  try {
    // Generate unique session ID
    const sessionId = nanoid(12);
    
    // Create session
    const session: Session = {
      id: sessionId,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_EXPIRY_MS,
      images: [],
      connected: false
    };
    
    sessions.set(sessionId, session);
    
    // Build upload URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                    request.nextUrl.origin;
    const uploadUrl = `${baseUrl}/upload/${sessionId}`;
    
    console.log(`Created session ${sessionId}, upload URL: ${uploadUrl}`);
    
    return NextResponse.json({
      sessionId,
      uploadUrl,
      expiresAt: session.expiresAt
    });
    
  } catch (error) {
    console.error('Failed to create session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sessions
 * List active sessions (for debugging)
 */
export async function GET() {
  const sessionList = Array.from(sessions.values()).map(s => ({
    id: s.id,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    imageCount: s.images.length,
    connected: s.connected
  }));
  
  return NextResponse.json({ sessions: sessionList });
}

// ============================================================================
// EXPORTED UTILITIES
// ============================================================================

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

/**
 * Add image to session for relay
 */
export function addImageToSession(sessionId: string, imageData: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  
  session.images.push(imageData);
  return true;
}

/**
 * Get and clear pending images from session
 */
export function getPendingImages(sessionId: string): string[] {
  const session = sessions.get(sessionId);
  if (!session) return [];
  
  const images = [...session.images];
  session.images = [];
  return images;
}

/**
 * Mark session as connected
 */
export function setSessionConnected(sessionId: string, connected: boolean): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.connected = connected;
  }
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

