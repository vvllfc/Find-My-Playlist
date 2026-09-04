import type { GoTrueClient } from '@supabase/auth-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'

// The project ref is the first label of the Supabase hostname. It feeds nothing
// but the storage key below, where matching supabase-js's own convention
// (sb-<ref>-auth-token) is what lets the session be found in devtools under the
// name every Supabase guide tells you to look for.
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0]

export const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`

/**
 * Whether this browser holds a session, answered without loading anything.
 *
 * This is what lets the auth client stay off the critical path: most visitors
 * never sign in, and they have no reason to download the machinery for
 * refreshing a token they do not have. The key is one we set ourselves, so the
 * question is exact rather than a guess.
 *
 * A stored session is not necessarily a valid one — it may be expired, and the
 * client will find that out and clear it. What matters here is only that its
 * absence is proof there is nothing to restore.
 */
export function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) !== null
  } catch {
    // Storage blocked outright. Signing in would not work either, so treating
    // that as signed out is both true and the only thing left to do.
    return false
  }
}

let client: Promise<GoTrueClient> | null = null

/**
 * The auth client, fetched on first need and then reused.
 *
 * Only the auth half of Supabase is installed: @supabase/supabase-js would also
 * pull in realtime, storage and edge-functions clients this site never calls,
 * and its SupabaseClient builds a RealtimeClient unconditionally, so none of it
 * tree-shakes away. This is the same code supabase-js runs for auth — token
 * refresh, PKCE and multi-tab locking are exactly where a bug would be a
 * security bug, so that part is not hand-rolled. Reads and writes against
 * PostgREST are plain fetch, in the shape of src/lib/github.ts.
 */
export function getAuth(): Promise<GoTrueClient> {
  client ??= import('@supabase/auth-js').then(
    ({ GoTrueClient }) =>
      new GoTrueClient({
        url: `${SUPABASE_URL}/auth/v1`,
        headers: { apikey: SUPABASE_ANON_KEY },
        storageKey: AUTH_STORAGE_KEY,
        // A standalone GoTrueClient defaults to the implicit flow, which hands
        // the access token straight back in the URL fragment — into browser
        // history, and into the referrer of anything the page loads next. PKCE
        // returns a single-use code instead, so it has to be asked for by name.
        flowType: 'pkce',
        // Also on by default, and it would consume any ?code= it finds the
        // moment the client is built — including the one Spotify's login
        // returns to this same origin. Which provider a code belongs to is
        // decided by its landing path (see App.tsx), and nothing may run ahead
        // of that.
        detectSessionInUrl: false,
        autoRefreshToken: true,
        persistSession: true,
      }),
  )
  return client
}

export class SupabaseError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// The anon key when nobody is signed in, the person's own token when somebody
// is. Getting this backwards would quietly run every write as the anonymous
// role, which holds no privilege on these tables at all — so the tests assert
// on it rather than trusting it. The storage probe comes first so a visitor who
// never signs in never downloads the auth client to be told they have no token.
async function bearer(): Promise<string> {
  if (!hasStoredSession()) return SUPABASE_ANON_KEY
  const auth = await getAuth()
  const { data } = await auth.getSession()
  return data.session?.access_token ?? SUPABASE_ANON_KEY
}

/**
 * One call against PostgREST, in the shape of src/lib/github.ts — the data
 * layer here is a handful of requests of one column each, so a query builder
 * would be three dependencies and a fluent chain that the node-only test setup
 * cannot assert against.
 */
export async function restFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await bearer()
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  })
  if (!res.ok) throw new SupabaseError(`${res.status} ${await res.text()}`, res.status)
  return res
}
