/**
 * Session Management API
 * 
 * Creates and manages upload sessions for QR code-based image transfer.
 * Sessions are short-lived (5 minutes) and stored in Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createClient } from '@/lib/supabase/server';

// Force dynamic rendering - sessions must never be cached
export const dynamic = 'force-dynamic';

// ============================================================================
// TYPES
// ============================================================================

export interface Session {
  id: string;
  created_at: string;
  expires_at: string;
  images: string[];  // Base64 images waiting to be relayed
  connected: boolean; // Is extension connected via SSE?
}

// Session expiry time (5 minutes)
const SESSION_EXPIRY_MS = 5 * 60 * 1000;

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * POST /api/sessions
 * Create a new upload session
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Generate unique session ID
    const sessionId = nanoid(12);
    
    // Calculate expiry time
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS).toISOString();
    
    // Create session in Supabase
    const { error } = await supabase
      .from('upload_sessions')
      .insert({
        id: sessionId,
        expires_at: expiresAt,
        images: [],
        connected: false
      });
    
    if (error) {
      console.error('Failed to create session in Supabase:', error);
      throw new Error('Failed to create session');
    }
    
    // Build upload URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                    request.nextUrl.origin;
    const uploadUrl = `${baseUrl}/upload/${sessionId}`;
    
    console.log(`Created session ${sessionId}, upload URL: ${uploadUrl}`);
    
    return NextResponse.json({
      sessionId,
      uploadUrl,
      expiresAt
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
  try {
    const supabase = await createClient();
    
    // Get all non-expired sessions
    const { data: sessions, error } = await supabase
      .from('upload_sessions')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    const sessionList = (sessions || []).map(s => ({
      id: s.id,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      imageCount: (s.images as string[])?.length || 0,
      connected: s.connected
    }));
    
    return NextResponse.json({ sessions: sessionList });
    
  } catch (error) {
    console.error('Failed to list sessions:', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 }
    );
  }
}

// ============================================================================
// EXPORTED UTILITIES (for use by other API routes)
// ============================================================================

/**
 * Get a session by ID
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('upload_sessions')
    .select('*')
    .eq('id', sessionId)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return {
    id: data.id,
    created_at: data.created_at,
    expires_at: data.expires_at,
    images: (data.images as string[]) || [],
    connected: data.connected
  };
}

/**
 * Add image to session for relay
 */
export async function addImageToSession(sessionId: string, imageData: string): Promise<boolean> {
  const supabase = await createClient();
  
  console.log(`[addImageToSession] Adding image to session ${sessionId}`);
  console.log(`[addImageToSession] Image data preview: ${imageData.substring(0, 100)}...`);
  
  // First get current images
  const session = await getSession(sessionId);
  if (!session) {
    console.log(`[addImageToSession] Session ${sessionId} not found`);
    return false;
  }
  
  console.log(`[addImageToSession] Current images in session: ${session.images.length}`);
  
  // Append new image
  const updatedImages = [...session.images, imageData];
  
  console.log(`[addImageToSession] Updating session with ${updatedImages.length} images`);
  
  const { error } = await supabase
    .from('upload_sessions')
    .update({ images: updatedImages })
    .eq('id', sessionId);
  
  if (error) {
    console.error(`[addImageToSession] Failed to update session:`, error);
    return false;
  }
  
  console.log(`[addImageToSession] Successfully added image to session ${sessionId}`);
  return true;
}

/**
 * Get and clear pending images from session
 */
export async function getPendingImages(sessionId: string): Promise<string[]> {
  const supabase = await createClient();
  
  console.log(`[getPendingImages] Fetching images for session ${sessionId}`);
  
  // Get current session
  const session = await getSession(sessionId);
  if (!session) {
    console.log(`[getPendingImages] Session ${sessionId} not found`);
    return [];
  }
  
  const images = [...session.images];
  console.log(`[getPendingImages] Found ${images.length} pending image(s)`);
  
  // Clear images if there are any
  if (images.length > 0) {
    console.log(`[getPendingImages] Clearing images from session ${sessionId}`);
    const { error } = await supabase
      .from('upload_sessions')
      .update({ images: [] })
      .eq('id', sessionId);
    
    if (error) {
      console.error(`[getPendingImages] Failed to clear images:`, error);
      // Still return the images even if clearing failed
    } else {
      console.log(`[getPendingImages] Successfully cleared images from session`);
    }
  }
  
  return images;
}

/**
 * Mark session as connected
 */
export async function setSessionConnected(sessionId: string, connected: boolean): Promise<void> {
  const supabase = await createClient();
  
  await supabase
    .from('upload_sessions')
    .update({ connected })
    .eq('id', sessionId);
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = await createClient();
  
  await supabase
    .from('upload_sessions')
    .delete()
    .eq('id', sessionId);
}
