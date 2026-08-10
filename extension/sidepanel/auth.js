/**
 * CFAuth — Supabase authentication for the side panel.
 *
 * Wraps a supabase-js client (vendor/supabase.js UMD build) whose session is
 * persisted in chrome.storage.local, so it survives panel close and browser
 * restarts and is readable by the service worker if it ever needs a token.
 *
 * Google sign-in runs through chrome.identity.launchWebAuthFlow against
 * Supabase's /auth/v1/authorize (PKCE). Google itself only ever sees Supabase's
 * callback, so no extension-specific Google OAuth client is required — but the
 * redirect URL https://<extension-id>.chromiumapp.org/ must be listed in
 * Supabase Auth → URL Configuration → Redirect URLs, which is why the
 * manifest pins the extension id with a "key".
 */

const CFAuth = (() => {
  // supabase-js expects a synchronous-looking storage interface but supports
  // async getItem/setItem/removeItem — bridge to chrome.storage.local.
  const chromeStorageAdapter = {
    async getItem(key) {
      const result = await chrome.storage.local.get(key);
      return result[key] ?? null;
    },
    async setItem(key, value) {
      await chrome.storage.local.set({ [key]: value });
    },
    async removeItem(key) {
      await chrome.storage.local.remove(key);
    },
  };

  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: chromeStorageAdapter,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });

  const listeners = [];

  client.auth.onAuthStateChange((event, session) => {
    listeners.forEach((fn) => {
      try {
        fn(event, session);
      } catch (err) {
        console.error('CFAuth listener error:', err);
      }
    });
  });

  async function getSession() {
    const { data } = await client.auth.getSession();
    return data.session || null;
  }

  async function getUser() {
    const session = await getSession();
    return session ? session.user : null;
  }

  async function getAccessToken() {
    const session = await getSession();
    return session ? session.access_token : null;
  }

  async function signInWithPassword(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async function signUp(email, password) {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    // With email confirmation on, there is no session until the link is clicked.
    return { user: data.user, needsConfirmation: !data.session };
  }

  async function signInWithGoogle() {
    const redirectTo = chrome.identity.getRedirectURL();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;

    const resultUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: data.url, interactive: true },
        (responseUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!responseUrl) {
            reject(new Error('Sign-in was cancelled'));
          } else {
            resolve(responseUrl);
          }
        }
      );
    });

    const code = new URL(resultUrl).searchParams.get('code');
    if (!code) {
      const description = new URL(resultUrl).searchParams.get('error_description');
      throw new Error(description || 'Google sign-in failed');
    }

    const { data: sessionData, error: exchangeError } =
      await client.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return sessionData.user;
  }

  async function resetPassword(email) {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://crewforms.vercel.app/auth/callback?next=%2Fauth%2Fupdate-password',
    });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  function onAuthStateChange(fn) {
    listeners.push(fn);
  }

  return {
    client,
    getSession,
    getUser,
    getAccessToken,
    signInWithPassword,
    signUp,
    signInWithGoogle,
    resetPassword,
    signOut,
    onAuthStateChange,
  };
})();
