import { GoTrueClient } from '@supabase/auth-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'

// The project ref is the first label of the Supabase hostname. It feeds nothing
// but the storage key below, where matching supabase-js's own convention
// (sb-<ref>-auth-token) is what lets the session be found in devtools under the
// name every Supabase guide tells you to look for.
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0]

// Only the auth half of Supabase is installed: @supabase/supabase-js would also
// pull in realtime, storage and edge-functions clients this site never calls,
// and its SupabaseClient builds a RealtimeClient unconditionally, so none of it
// tree-shakes away. This is the same code supabase-js runs for auth — token
// refresh, PKCE and multi-tab locking are exactly where a bug would be a
// security bug, so that part is not hand-rolled. Reads and writes against
// PostgREST are plain fetch, in the shape of src/lib/github.ts.
export const auth = new GoTrueClient({
  url: `${SUPABASE_URL}/auth/v1`,
  headers: { apikey: SUPABASE_ANON_KEY },
  storageKey: `sb-${PROJECT_REF}-auth-token`,
  // A standalone GoTrueClient defaults to the implicit flow, which hands the
  // access token straight back in the URL fragment — into browser history, and
  // into the referrer of anything the page loads next. PKCE returns a
  // single-use code instead, so it has to be asked for by name.
  flowType: 'pkce',
  // Also on by default, and it would consume any ?code= it finds the moment
  // this module is evaluated — including the one Spotify's login returns to
  // this same origin. Which provider a code belongs to is decided by its
  // landing path (see App.tsx), and nothing may run ahead of that.
  detectSessionInUrl: false,
  autoRefreshToken: true,
  persistSession: true,
})
