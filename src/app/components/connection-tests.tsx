'use client'

/**
 * Connection Tests Component
 * 
 * Client component that tests Edge Function connectivity.
 * Must be client-side to make browser fetch requests.
 */

import { useState } from 'react'

interface EdgeFunctionResponse {
  success: boolean
  message: string
  timestamp: string
  server?: {
    runtime: string
    version: string
    method: string
    path: string
  }
  environment?: {
    hasSupabaseUrl: boolean
    hasAnonKey: boolean
    hasServiceRoleKey: boolean
  }
  error?: string
}

export function ConnectionTests({ supabaseUrl, supabaseAnonKey }: { supabaseUrl: string; supabaseAnonKey: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [response, setResponse] = useState<EdgeFunctionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Test the Edge Function
  const testEdgeFunction = async () => {
    setStatus('loading')
    setError(null)
    setResponse(null)

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/hello-world`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
      })

      const data = await res.json()
      
      if (data.success) {
        setStatus('success')
        setResponse(data)
      } else {
        setStatus('error')
        setError(data.error || 'Unknown error')
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to connect')
    }
  }

  // Determine card styling based on status
  const statusColors = {
    idle: 'border-slate-500/50 bg-slate-500/10',
    loading: 'border-blue-500/50 bg-blue-500/10',
    success: 'border-emerald-500/50 bg-emerald-500/10',
    error: 'border-red-500/50 bg-red-500/10',
  }

  const dotColors = {
    idle: 'bg-slate-400',
    loading: 'bg-blue-400 animate-pulse',
    success: 'bg-emerald-400',
    error: 'bg-red-400',
  }

  return (
    <div className={`rounded-xl border p-6 ${statusColors[status]}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <h2 className="font-semibold text-slate-100">Edge Functions</h2>
        </div>
        <div className={`w-3 h-3 rounded-full ${dotColors[status]}`} />
      </div>

      {/* Content */}
      <div className="text-sm text-slate-300 space-y-3">
        {/* Test Button */}
        <button
          onClick={testEdgeFunction}
          disabled={status === 'loading'}
          className="w-full py-2 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-slate-200 font-medium"
        >
          {status === 'loading' ? 'Testing...' : 'Test Edge Function'}
        </button>

        {/* Status Display */}
        {status === 'idle' && (
          <p className="text-slate-400 text-center">Click to test connection</p>
        )}

        {status === 'loading' && (
          <p className="text-blue-400 text-center">Connecting to Edge Function...</p>
        )}

        {status === 'success' && response && (
          <div className="space-y-2 pt-2 border-t border-slate-700">
            <StatusRow label="Status" value="Connected" />
            <StatusRow label="Runtime" value={response.server?.runtime || 'N/A'} />
            <StatusRow label="Deno Version" value={response.server?.version || 'N/A'} />
            <p className="text-xs text-slate-400 mt-2">
              Response at: {response.timestamp}
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30">
            <p className="text-red-300 text-sm">{error}</p>
            <p className="text-red-400/70 text-xs mt-1">
              Make sure the Edge Function is deployed: <code>supabase functions deploy hello-world</code>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Helper component for status rows
 */
function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}:</span>
      <span className="text-slate-200 font-mono text-xs">{value}</span>
    </div>
  )
}

