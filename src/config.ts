// GitHub repo the admin page commits to (Contents API) and redeploys (Actions API).
export const GITHUB_OWNER = 'vvllfc'
export const GITHUB_REPO = 'Find-My-Playlist'
export const GITHUB_BRANCH = 'main'
export const GITHUB_WORKFLOW_FILE = 'deploy.yml'
export const GITHUB_META_PATH = 'data/playlists.meta.json'

// Spotify app Client ID — not a secret, safe to check in (only the Client Secret is sensitive,
// and it's never used in the browser). Fill in after creating the Spotify Developer app (see README).
export const SPOTIFY_CLIENT_ID = '2b01b97e86a64526a884b821b0215df5'
export const SPOTIFY_REDIRECT_URI = 'https://vlfmusic.fr/'
export const SPOTIFY_SCOPES = ['playlist-read-private', 'playlist-modify-public', 'playlist-modify-private']

// SHA-256 hex hash of a password gate for #/admin — a deterrent against casual
// visitors, not real security (see src/lib/adminGate.ts). Leave empty to
// disable the gate. Generate a hash with: node scripts/hash-password.mjs "…"
export const ADMIN_GATE_PASSWORD_HASH = ''
