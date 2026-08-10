/**
 * Login / Signup / Forgot-password page
 *
 * Single page with an in-page mode toggle. Email+password and Google OAuth,
 * both through Supabase Auth. OAuth and email links land on /auth/callback.
 */

'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup' | 'forgot';

function sanitizeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/admin';
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams.get('next'));

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get('error') ? 'Sign-in link was invalid or expired. Please try again.' : null
  );
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        setNotice('Check your email for a confirmation link.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent('/auth/update-password')}`,
        });
        if (error) throw error;
        setNotice('Check your email for a password reset link.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
    // On success the browser navigates away to Google.
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">CrewForms</h1>
        <p className="text-sm text-slate-500 mb-6">
          {mode === 'signin' && 'Sign in to your account'}
          {mode === 'signup' && 'Create an account'}
          {mode === 'forgot' && 'Reset your password'}
        </p>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          {mode !== 'forgot' && (
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-700 disabled:opacity-50"
          >
            {mode === 'signin' && 'Sign in'}
            {mode === 'signup' && 'Create account'}
            {mode === 'forgot' && 'Send reset link'}
          </button>
        </form>

        {mode !== 'forgot' && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="h-px bg-slate-200 flex-1" />
              <span className="text-xs text-slate-400">or</span>
              <div className="h-px bg-slate-200 flex-1" />
            </div>
            <button
              onClick={handleGoogle}
              disabled={busy}
              className="w-full rounded-md border border-slate-300 text-slate-700 text-sm font-medium py-2 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              Continue with Google
            </button>
          </>
        )}

        <div className="mt-6 text-sm text-slate-500 space-y-1">
          {mode === 'signin' && (
            <>
              <p>
                No account?{' '}
                <button className="text-slate-900 underline" onClick={() => { setMode('signup'); setError(null); setNotice(null); }}>
                  Create one
                </button>
              </p>
              <p>
                <button className="text-slate-900 underline" onClick={() => { setMode('forgot'); setError(null); setNotice(null); }}>
                  Forgot password?
                </button>
              </p>
            </>
          )}
          {mode !== 'signin' && (
            <p>
              <button className="text-slate-900 underline" onClick={() => { setMode('signin'); setError(null); setNotice(null); }}>
                Back to sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
