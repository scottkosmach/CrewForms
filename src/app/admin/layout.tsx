/**
 * Admin layout: auth gate + account bar
 *
 * Server-side gate for the whole /admin tree — defense in depth behind the
 * middleware redirect (middleware alone is not a security boundary). The admin
 * pages themselves are untouched client components.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/admin')
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 24px',
          background: '#0f172a',
          color: '#e2e8f0',
          fontSize: '13px',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <span>{user.email}</span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            style={{
              background: 'transparent',
              border: '1px solid #475569',
              borderRadius: '6px',
              color: '#e2e8f0',
              padding: '4px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </form>
      </div>
      {children}
    </div>
  )
}
