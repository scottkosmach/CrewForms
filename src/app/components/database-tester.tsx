'use client'

/**
 * Database Tester Component
 * 
 * Allows users to insert test records and verify database write operations.
 * Uses the browser Supabase client for client-side mutations.
 */

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function DatabaseTester() {
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<string | null>(null)

  // Insert a test record
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!message.trim()) {
      setResult('Please enter a message')
      setStatus('error')
      return
    }

    setStatus('loading')
    setResult(null)

    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('connection_tests')
        .insert({ message: message.trim() })
        .select()
        .single()

      if (error) {
        setStatus('error')
        setResult(`Error: ${error.message}`)
      } else {
        setStatus('success')
        setResult(`Success! Record created with ID: ${data.id.slice(0, 8)}...`)
        setMessage('')
      }
    } catch (err) {
      setStatus('error')
      setResult(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  // Quick test with timestamp
  const quickTest = async () => {
    setMessage(`Test from browser at ${new Date().toLocaleTimeString()}`)
    // Trigger form submission on next tick
    setTimeout(() => {
      const form = document.getElementById('db-test-form') as HTMLFormElement
      form?.requestSubmit()
    }, 100)
  }

  return (
    <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700">
      <h3 className="text-lg font-semibold mb-4 text-slate-200">
        📝 Database Write Test
      </h3>
      
      <form id="db-test-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Input Field */}
        <div>
          <label htmlFor="message" className="block text-sm text-slate-400 mb-2">
            Test Message
          </label>
          <input
            id="message"
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter a test message..."
            className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={status === 'loading'}
            className="flex-1 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white font-medium"
          >
            {status === 'loading' ? 'Inserting...' : 'Insert Record'}
          </button>
          
          <button
            type="button"
            onClick={quickTest}
            disabled={status === 'loading'}
            className="py-2 px-4 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-slate-200 font-medium"
          >
            Quick Test
          </button>
        </div>
      </form>

      {/* Result Display */}
      {result && (
        <div
          className={`mt-4 p-3 rounded-lg ${
            status === 'success'
              ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/20 border border-red-500/30 text-red-300'
          }`}
        >
          <p className="text-sm">{result}</p>
        </div>
      )}

      {/* Help Text */}
      <p className="mt-4 text-xs text-slate-500">
        This inserts a record into the <code className="text-slate-400">connection_tests</code> table.
        Refresh the page to see new records in the Database Status card.
      </p>
    </div>
  )
}

