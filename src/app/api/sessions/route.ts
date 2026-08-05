/**
 * Session Management API
 *
 * Creates and manages upload sessions for QR code-based image transfer.
 * Sessions are short-lived (5 minutes) and stored in Supabase.
 *
 * SECURITY NOTE: a session id is a bearer secret. Anyone holding one can drain
 * that session's passport images via /api/sessions/[id]/images, so ids must not
 * be listed by any endpoint and must not be written to logs in full.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createAdminClient } from '@/lib/supabase/admin';

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

/**
 * Session ids are credentials, so logs get a short prefix only — enough to
 * correlate lines from one upload, useless for replaying it.
 */
function tag(sessionId: string): string {
  return `${sessionId.slice(0, 4)}…`;
}

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * POST /api/sessions
 * Create a new upload session
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();

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

    console.log(`Created session ${tag(sessionId)}`);

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

// NOTE: there is deliberately no GET /api/sessions.
//
// It used to list every active session id, unauthenticated. Combined with the
// unvalidated images endpoint that made passport images readable by anyone:
// list the ids, then fetch the images — no credentials required. Worse, the
// fetch clears the queue, so the theft also destroyed the captain's upload.
// Nothing ever called it (the extension's only bare-path request is the POST
// above), so it is gone rather than gated.

// ============================================================================
// EXPORTED UTILITIES (for use by other API routes)
// ============================================================================

/**
 * Get a session by ID
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const supabase = createAdminClient();

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
 * Check that a session exists and has not expired, without loading its images.
 */
export async function sessionExists(sessionId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('upload_sessions')
    .select('id')
    .eq('id', sessionId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  return !error && !!data;
}

/**
 * Add image to session for relay (atomic — no read-modify-write race condition)
 */
export async function addImageToSession(sessionId: string, imageData: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('append_session_image', {
    p_session_id: sessionId,
    p_image_data: imageData
  });

  if (error) {
    console.error(`[addImageToSession] RPC error for ${tag(sessionId)}:`, error);
    return false;
  }

  const success = data === true;

  if (!success) {
    console.log(`[addImageToSession] Session ${tag(sessionId)} not found or expired`);
  }

  return success;
}

/**
 * Get and clear pending images from session (atomic — row-level lock prevents race conditions)
 */
export async function getPendingImages(sessionId: string): Promise<string[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('fetch_and_clear_session_images', {
    p_session_id: sessionId
  });

  if (error) {
    console.error(`[getPendingImages] RPC error for ${tag(sessionId)}:`, error);
    return [];
  }

  // The RPC returns a JSONB array — parse it to string[]
  const images: string[] = Array.isArray(data) ? data : [];
  console.log(`[getPendingImages] Relayed ${images.length} image(s) for ${tag(sessionId)}`);

  return images;
}

/**
 * Mark session as connected
 */
export async function setSessionConnected(sessionId: string, connected: boolean): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from('upload_sessions')
    .update({ connected })
    .eq('id', sessionId);
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from('upload_sessions')
    .delete()
    .eq('id', sessionId);
}
