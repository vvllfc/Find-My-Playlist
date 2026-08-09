import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES } from '../config'

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const VERIFIER_KEY = 'spotify_pkce_verifier'
const STATE_KEY = 'spotify_pkce_state'
const PURPOSE_KEY = 'spotify_pkce_purpose'
const TOKENS_KEY = 'spotify_tokens'
const CI_TOKENS_KEY = 'spotify_tokens_ci_readonly'
const EXPIRY_BUFFER_MS = 60_000

// The CI build only ever needs to read the public playlist list, so its login
// requests read-only scope — keeping the secret later pasted into GitHub
// Actions incapable of modifying the account, unlike the full admin login.
const CI_READONLY_SCOPES = ['playlist-read-private']

export type LoginPurpose = 'edit' | 'ci-export'

export interface SpotifyTokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

function randomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, (v) => charset[v % charset.length]).join('')
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(digest)
}

function keyFor(purpose: LoginPurpose): string {
  return purpose === 'ci-export' ? CI_TOKENS_KEY : TOKENS_KEY
}

function storeTokens(purpose: LoginPurpose, data: { access_token: string; refresh_token?: string; expires_in: number }): void {
  const existing = getStoredTokens(purpose)
  const tokens: SpotifyTokenSet = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? existing?.refreshToken ?? '',
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  localStorage.setItem(keyFor(purpose), JSON.stringify(tokens))
}

export function getStoredTokens(purpose: LoginPurpose = 'edit'): SpotifyTokenSet | null {
  const raw = localStorage.getItem(keyFor(purpose))
  if (!raw) return null
  try {
    return JSON.parse(raw) as SpotifyTokenSet
  } catch {
    return null
  }
}

export function isLoggedIn(purpose: LoginPurpose = 'edit'): boolean {
  return getStoredTokens(purpose) !== null
}

export function clearTokens(purpose: LoginPurpose = 'edit'): void {
  localStorage.removeItem(keyFor(purpose))
}

// Kicks off Spotify's own login screen at accounts.spotify.com — the app never
// sees the owner's Spotify credentials, only the resulting authorization code.
// `purpose: 'ci-export'` requests read-only scope, for generating a refresh
// token safe to store as a GitHub Actions secret; `'edit'` requests the full
// modify scopes used by the direct-edit playlist manager below.
export async function startLogin(purpose: LoginPurpose = 'edit'): Promise<void> {
  const verifier = randomString(64)
  const state = randomString(32)
  const challenge = await generateCodeChallenge(verifier)

  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  sessionStorage.setItem(PURPOSE_KEY, purpose)

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: (purpose === 'ci-export' ? CI_READONLY_SCOPES : SPOTIFY_SCOPES).join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })

  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`
}

// Call once on app load. Returns the login purpose if this page load was a
// Spotify login redirect that completed successfully, so the caller knows
// which UI to update (edit-mode vs. the CI token export flow).
export async function handleRedirectCallback(): Promise<LoginPurpose | null> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const returnedState = params.get('state')
  const error = params.get('error')

  if (!code && !error) return null

  const expectedState = sessionStorage.getItem(STATE_KEY)
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  const purpose = (sessionStorage.getItem(PURPOSE_KEY) as LoginPurpose | null) ?? 'edit'
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(PURPOSE_KEY)

  // Strip the OAuth query params from the address bar regardless of outcome.
  window.history.replaceState({}, '', window.location.pathname + window.location.hash)

  if (error || !code || !verifier || returnedState !== expectedState) {
    return null
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: verifier,
    }),
  })

  if (!res.ok) return null

  storeTokens(purpose, await res.json())
  return purpose
}

export async function ensureFreshAccessToken(purpose: LoginPurpose = 'edit'): Promise<string | null> {
  const tokens = getStoredTokens(purpose)
  if (!tokens) return null

  if (Date.now() < tokens.expiresAt - EXPIRY_BUFFER_MS) {
    return tokens.accessToken
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    }),
  })

  if (!res.ok) {
    clearTokens(purpose)
    return null
  }

  const data = await res.json()
  storeTokens(purpose, data)
  return data.access_token
}
