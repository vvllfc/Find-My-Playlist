import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES } from '../config'

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const VERIFIER_KEY = 'spotify_pkce_verifier'
const STATE_KEY = 'spotify_pkce_state'
const TOKENS_KEY = 'spotify_tokens'
const EXPIRY_BUFFER_MS = 60_000

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

function storeTokens(data: { access_token: string; refresh_token?: string; expires_in: number }): void {
  const existing = getStoredTokens()
  const tokens: SpotifyTokenSet = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? existing?.refreshToken ?? '',
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

export function getStoredTokens(): SpotifyTokenSet | null {
  const raw = localStorage.getItem(TOKENS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SpotifyTokenSet
  } catch {
    return null
  }
}

export function isLoggedIn(): boolean {
  return getStoredTokens() !== null
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY)
}

// Kicks off Spotify's own login screen at accounts.spotify.com — the app never
// sees the owner's Spotify credentials, only the resulting authorization code.
export async function startLogin(): Promise<void> {
  const verifier = randomString(64)
  const state = randomString(32)
  const challenge = await generateCodeChallenge(verifier)

  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })

  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`
}

// Call once on app load. Returns true if this page load was a Spotify login
// redirect that completed successfully (caller should then route to #/admin).
export async function handleRedirectCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const returnedState = params.get('state')
  const error = params.get('error')

  if (!code && !error) return false

  const expectedState = sessionStorage.getItem(STATE_KEY)
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)

  // Strip the OAuth query params from the address bar regardless of outcome.
  window.history.replaceState({}, '', window.location.pathname + window.location.hash)

  if (error || !code || !verifier || returnedState !== expectedState) {
    return false
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

  if (!res.ok) return false

  storeTokens(await res.json())
  return true
}

export async function ensureFreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens()
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
    clearTokens()
    return null
  }

  const data = await res.json()
  storeTokens(data)
  return data.access_token
}
