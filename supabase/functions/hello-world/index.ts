/**
 * Hello World Edge Function
 * 
 * A simple test function to verify Edge Function connectivity.
 * Returns server info, timestamp, and a greeting message.
 * 
 * Test locally: supabase functions serve
 * Deploy: supabase functions deploy hello-world
 */

// CORS headers for browser access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Modern Deno.serve() pattern (no external imports needed)
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get request info
    const url = new URL(req.url)
    
    // Build response data
    const responseData = {
      success: true,
      message: 'Hello from Supabase Edge Functions!',
      timestamp: new Date().toISOString(),
      server: {
        // Deno runtime info
        runtime: 'Deno',
        version: Deno.version.deno,
        // Request info
        method: req.method,
        path: url.pathname,
      },
      // Environment check (don't expose actual values)
      environment: {
        hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
        hasAnonKey: !!Deno.env.get('SUPABASE_ANON_KEY'),
        hasServiceRoleKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      },
    }

    // Return JSON response
    return new Response(
      JSON.stringify(responseData, null, 2),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    // Error handling
    console.error('Edge Function error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  }
})

