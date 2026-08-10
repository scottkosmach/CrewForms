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
import { requireApiUser } from '@/lib/api-auth';
import { tag } from '@/lib/upload-sessions';

// Force dynamic rendering - sessions must never be cached
export const dynamic = 'force-dynamic';

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
  // Only a signed-in user (extension or web) may create sessions. The session
  // is stamped with the creator so the destructive image-drain endpoint can
  // enforce ownership. The phone-side endpoints stay anonymous: the session id
  // itself is the phone's credential.
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

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
        connected: false,
        user_id: auth.user.id
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
