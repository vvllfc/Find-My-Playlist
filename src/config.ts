// GitHub repo the admin page commits to (Contents API) and redeploys (Actions API).
export const GITHUB_OWNER = 'vvllfc'
export const GITHUB_REPO = 'Find-My-Playlist'
export const GITHUB_BRANCH = 'main'
export const GITHUB_WORKFLOW_FILE = 'deploy.yml'
export const GITHUB_CONTENT_PATH = 'data/site-content.json'

// localStorage key for the admin's GitHub PAT — shared between #/admin (which
// sets it) and #/modify (which reuses it, if present, to auto-trigger a
// redeploy after a Spotify save without asking for the token a second time).
export const GITHUB_TOKEN_STORAGE_KEY = 'github_pat'

// Spotify app Client ID — not a secret, safe to check in (only the Client Secret is sensitive,
// and it's never used in the browser). Fill in after creating the Spotify Developer app (see README).
export const SPOTIFY_CLIENT_ID = '2b01b97e86a64526a884b821b0215df5'
export const SPOTIFY_REDIRECT_URI = 'https://vlfmusic.fr/'
export const SPOTIFY_SCOPES = ['playlist-read-private', 'playlist-modify-public', 'playlist-modify-private']

// SHA-256 hex hash of a password gate for #/admin — a deterrent against casual
// visitors, not real security (see src/lib/adminGate.ts). Leave empty to
// disable the gate. Generate a hash with: node scripts/hash-password.mjs "…"
export const ADMIN_GATE_PASSWORD_HASH = '5240afcfb49b04ede7ebf884c6bb61ab4a6abf3bdf95f196143d269952369419'

// Supabase project backing visitor accounts — Google sign-in, favourites and
// upvotes. The anon key is a public-role JWT: it is meant to ship in the
// bundle, exactly like the Spotify Client ID above. It is not what protects
// anything — Row Level Security is
// (supabase/migrations/0001_comptes_favoris_votes.sql), which decides row by
// row what this key is allowed to read or write. Hiding it in an environment
// variable would hide nothing: it comes back out verbatim in the served
// JavaScript. The service_role key, by contrast, bypasses every one of those
// rules and has no business in this repo, in any file, in any form.
export const SUPABASE_URL = 'https://hvfzgrtfcikamyssbipc.supabase.co'
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2ZnpncnRmY2lrYW15c3NiaXBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NzQwNTUsImV4cCI6MjEwNDA1MDA1NX0.aoXH9a2TRXu90kbLLPw2-RtpU3oE66aks67Ztht7Wvs'
