/**
 * Hello World Test Page
 * 
 * Tests connectivity to:
 * 1. Vercel (deployment platform)
 * 2. Supabase Database (PostgreSQL)
 * 3. Supabase Edge Functions
 * 
 * This page validates the entire stack is working before building the real app.
 */

import { createClient } from '@/lib/supabase/server'
import { ConnectionTests } from './components/connection-tests'

// Server Component - fetches initial data
export default async function HomePage() {
  // Check Vercel environment
  const isVercel = !!process.env.VERCEL
  const vercelEnv = process.env.VERCEL_ENV || 'local'
  
  // Test database connection
  let dbStatus: 'success' | 'error' | 'pending' = 'pending'
  let dbMessage = ''
  let dbRecords: Array<{ id: string; message: string; created_at: string }> = []
  
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('connection_tests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (error) {
      dbStatus = 'error'
      dbMessage = error.message
    } else {
      dbStatus = 'success'
      dbMessage = `Found ${data?.length || 0} record(s)`
      dbRecords = data || []
    }
  } catch (err) {
    dbStatus = 'error'
    dbMessage = err instanceof Error ? err.message : 'Unknown database error'
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-emerald-400">●</span> Hello World
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Vercel + Supabase Integration Test
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-12">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          
          {/* Vercel Status Card */}
          <StatusCard
            title="Vercel Deployment"
            status={isVercel ? 'success' : 'warning'}
            icon="🚀"
          >
            <div className="space-y-2">
              <StatusRow label="Platform" value={isVercel ? 'Vercel' : 'Local Dev'} />
              <StatusRow label="Environment" value={vercelEnv} />
              <StatusRow label="Region" value={process.env.VERCEL_REGION || 'N/A'} />
            </div>
          </StatusCard>

          {/* Database Status Card */}
          <StatusCard
            title="Supabase Database"
            status={dbStatus}
            icon="🗄️"
          >
            <div className="space-y-2">
              <StatusRow label="Connection" value={dbStatus === 'success' ? 'Connected' : 'Failed'} />
              <StatusRow label="Status" value={dbMessage} />
              {dbRecords.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <p className="text-xs text-slate-400 mb-2">Latest Records:</p>
                  {dbRecords.slice(0, 2).map((record) => (
                    <p key={record.id} className="text-xs text-slate-300 truncate">
                      • {record.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </StatusCard>

          {/* Edge Function Status Card - Client Component */}
          <ConnectionTests 
            supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL || ''} 
            supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}
          />
        </div>

        {/* Interactive Test Section */}
        <div className="mt-12">
          <h2 className="text-xl font-semibold mb-6 text-slate-200">Interactive Tests</h2>
          <DatabaseTester />
        </div>

        {/* Environment Info */}
        <div className="mt-12 p-6 rounded-xl bg-slate-800/50 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4 text-slate-200">Environment Configuration</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <EnvCheck 
              label="NEXT_PUBLIC_SUPABASE_URL" 
              isSet={!!process.env.NEXT_PUBLIC_SUPABASE_URL} 
            />
            <EnvCheck 
              label="NEXT_PUBLIC_SUPABASE_ANON_KEY" 
              isSet={!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY} 
            />
            <EnvCheck 
              label="VERCEL" 
              isSet={!!process.env.VERCEL} 
            />
            <EnvCheck 
              label="NEXT_PUBLIC_SITE_URL" 
              isSet={!!process.env.NEXT_PUBLIC_SITE_URL} 
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 mt-12">
        <div className="container mx-auto px-6 py-6 text-center text-slate-500 text-sm">
          <p>Built with Next.js 14 + Supabase + Vercel</p>
          <p className="mt-1">
            Timestamp: {new Date().toISOString()}
          </p>
        </div>
      </footer>
    </main>
  )
}

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Status Card Component
 * Displays a status indicator with content
 */
function StatusCard({
  title,
  status,
  icon,
  children,
}: {
  title: string
  status: 'success' | 'error' | 'warning' | 'pending'
  icon: string
  children: React.ReactNode
}) {
  const statusColors = {
    success: 'border-emerald-500/50 bg-emerald-500/10',
    error: 'border-red-500/50 bg-red-500/10',
    warning: 'border-amber-500/50 bg-amber-500/10',
    pending: 'border-slate-500/50 bg-slate-500/10',
  }

  const dotColors = {
    success: 'bg-emerald-400',
    error: 'bg-red-400',
    warning: 'bg-amber-400',
    pending: 'bg-slate-400 animate-pulse',
  }

  return (
    <div className={`rounded-xl border p-6 ${statusColors[status]}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <h2 className="font-semibold text-slate-100">{title}</h2>
        </div>
        <div className={`w-3 h-3 rounded-full ${dotColors[status]}`} />
      </div>
      <div className="text-sm text-slate-300">
        {children}
      </div>
    </div>
  )
}

/**
 * Status Row Component
 * Displays a label-value pair
 */
function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}:</span>
      <span className="text-slate-200 font-mono text-xs">{value}</span>
    </div>
  )
}

/**
 * Environment Check Component
 * Shows whether an env variable is configured
 */
function EnvCheck({ label, isSet }: { label: string; isSet: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-2 h-2 rounded-full ${isSet ? 'bg-emerald-400' : 'bg-red-400'}`} />
      <span className="font-mono text-sm text-slate-300">{label}</span>
      <span className={`ml-auto text-xs ${isSet ? 'text-emerald-400' : 'text-red-400'}`}>
        {isSet ? 'Set' : 'Missing'}
      </span>
    </div>
  )
}

/**
 * Database Tester Component (Client)
 * Allows inserting test records
 */
import { DatabaseTester } from './components/database-tester'
