import { useSyncExternalStore } from 'react'
import { AUTH_CALLBACK_PATH } from './router'
import { getAuth, hasStoredSession } from './supabase'

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in'
  userId: string | null
  email: string | null
}

// Where the visitor was when they left for Google. Kept here rather than in the
// redirect URL because Supabase only accepts redirect targets declared up front
// in its dashboard, and listing every folder of the catalogue there is not on
// the table.
const RETURN_TO_KEY = 'auth_return_to'

const SIGNED_OUT: AuthState = { status: 'signed-out', userId: null, email: null }

// 'loading' only for someone who actually has a session to restore. A visitor
// with nothing stored is signed out and known to be, before a byte of the auth
// client has been asked for — which also spares them the flicker of a menu that
// says nothing until a download finishes.
let state: AuthState = hasStoredSession() ? { status: 'loading', userId: null, email: null } : SIGNED_OUT
const listeners = new Set<() => void>()

// useSyncExternalStore compares snapshots by identity, not by content, so the
// object is only replaced when something in it actually changed. Rebuilding it
// on every read would spin React forever — router.ts gets away with reading the
// location freely only because its snapshot is a string, compared by value.
function setState(next: AuthState): void {
  if (next.status === state.status && next.userId === state.userId && next.email === state.email) return
  state = next
  for (const listener of listeners) listener()
  for (const watcher of watchers) watcher(state)
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function getAuthState(): AuthState {
  return state
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState, getAuthState)
}

// The same signal for callers that are not components — userLibrary loads and
// clears its rows on this, having no way to use a hook.
const watchers = new Set<(next: AuthState) => void>()

export function onAuthChange(listener: (next: AuthState) => void): () => void {
  watchers.add(listener)
  return () => watchers.delete(listener)
}

let wiring: Promise<void> | null = null

/**
 * Loads the auth client and points it at the store, once.
 *
 * Memoised rather than guarded by a flag, so the three callers that need a
 * client — a restored session, a sign-in, a returning redirect — can all ask
 * without racing each other into two clients and two subscriptions.
 *
 * One subscription for the whole app, opened here rather than from a component
 * effect: StrictMode mounts effects twice in development, so a provider would
 * hold two after every dev reload. auth-js emits INITIAL_SESSION on start, so
 * this one listener is also what moves the state off 'loading' — no separate
 * getSession() call.
 */
function ensureWired(): Promise<void> {
  wiring ??= getAuth().then((auth) => {
    auth.onAuthStateChange((_event, session) => {
      setState(
        session
          ? { status: 'signed-in', userId: session.user.id, email: session.user.email ?? null }
          : SIGNED_OUT,
      )
    })
  })
  return wiring
}

// Only for a visitor who has something to restore. Everyone else pays nothing
// for a feature they have not used, which is the whole point of splitting the
// client out of the initial bundle.
if (typeof window !== 'undefined' && hasStoredSession()) void ensureWired()

export async function signInWithGoogle(): Promise<void> {
  sessionStorage.setItem(RETURN_TO_KEY, window.location.pathname + window.location.hash)
  // Wired before the redirect so the session that comes back has somewhere to
  // land, whichever page the visitor returns to.
  await ensureWired()
  const auth = await getAuth()
  await auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
      // Signing out clears the session on this side, but not the one Google
      // keeps: without this, the next sign-in silently picks the account that
      // just left, and there is no way to reach a second one. select_account
      // makes Google ask every time, which costs one click and is the only
      // thing that makes leaving, and switching, actually possible.
      queryParams: { prompt: 'select_account' },
    },
  })
}

export async function signOut(): Promise<void> {
  const auth = await getAuth()
  await auth.signOut()
}

export interface SignInOutcome {
  /** Where to send the visitor once the exchange is done. */
  returnTo: string
  /** Set when the login failed; the callback page shows it and stays put. */
  error: string | null
}

let exchange: Promise<SignInOutcome> | null = null

/**
 * Finishes the Google login and says where to go next. Memoised rather than
 * guarded by a boolean: StrictMode replays the effect that calls this, and
 * handing back the same promise lets the second call await the first instead of
 * spending a code that has already been consumed — an authorization code is
 * single-use and lives five minutes.
 */
export function completeGoogleSignIn(): Promise<SignInOutcome> {
  exchange ??= runExchange()
  return exchange
}

async function runExchange(): Promise<SignInOutcome> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const denied = params.get('error')

  const stored = sessionStorage.getItem(RETURN_TO_KEY)
  sessionStorage.removeItem(RETURN_TO_KEY)
  // Coming back to the callback path itself would leave the visitor staring at
  // the "connexion en cours" screen with nothing left to happen.
  const returnTo = !stored || stored.startsWith(AUTH_CALLBACK_PATH) ? '/' : stored

  // Clear the code from the address bar whichever way this goes, the way the
  // Spotify callback already does: one left in history is one somebody can
  // replay into an exchange that is bound to fail.
  window.history.replaceState({}, '', AUTH_CALLBACK_PATH)

  if (denied) return { returnTo, error: 'La connexion a été refusée.' }
  if (!code) return { returnTo, error: 'Cette page a été ouverte sans code de connexion.' }

  // This page load started with nothing stored, so nothing wired itself up: the
  // subscription has to exist before the exchange, or the session would arrive
  // with no listener to notice it.
  await ensureWired()
  const auth = await getAuth()
  const { error } = await auth.exchangeCodeForSession(code)
  if (error) return { returnTo, error: "La connexion n'a pas pu être terminée." }
  return { returnTo, error: null }
}
