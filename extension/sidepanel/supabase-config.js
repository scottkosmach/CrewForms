/**
 * Supabase project constants for the extension.
 *
 * Both values are public by design — the anon (publishable) key ships to every
 * browser that loads the web app too. Row Level Security on the Supabase side
 * is the actual security boundary: a signed-in user's JWT only ever reaches
 * their own rows and their own storage folder.
 */

const SUPABASE_URL = 'https://kgjlgxihnajaqtocozko.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yldchee_tvHZnamx_UgU1A_9m-5sjpl';
