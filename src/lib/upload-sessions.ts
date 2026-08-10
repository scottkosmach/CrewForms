/**
 * Upload session utilities
 *
 * Shared by the /api/sessions route family. Moved out of the route file
 * because Next.js route modules may only export HTTP handlers.
 *
 * SECURITY NOTE: a session id is a bearer secret. Anyone holding one can push
 * images into that session, so ids must not be listed by any endpoint and
 * must not be written to logs in full.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface Session {
  id: string;
  created_at: string;
  expires_at: string;
  images: string[];  // Base64 images waiting to be relayed
  connected: boolean; // Is extension connected via SSE?
}

/**
 * Session ids are credentials, so logs get a short prefix only — enough to
 * correlate lines from one upload, useless for replaying it.
 */
export function tag(sessionId: string): string {
  return `${sessionId.slice(0, 4)}…`;
}

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
 * Check that a live session belongs to the given user. Rows created before
 * ownership stamping shipped have a null user_id; they expire within five
 * minutes, so the null grace path retires itself.
 */
export async function sessionOwnedBy(sessionId: string, userId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('upload_sessions')
    .select('user_id')
    .eq('id', sessionId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return false;
  return data.user_id === null || data.user_id === userId;
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
