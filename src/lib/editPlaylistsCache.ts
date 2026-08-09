import type { SpotifyPlaylistSummary } from './spotifyApi'

const CACHE_KEY = 'spotify_edit_playlists_cache'

interface Cache {
  fetchedAt: number
  playlists: SpotifyPlaylistSummary[]
}

// Purely manual — no automatic staleness expiry. Fetching this list costs
// roughly one Spotify API call per 50 playlists, so it's only refetched when
// the owner explicitly asks (matches the "Rafraîchir" pattern used elsewhere
// in the admin/modify pages), not on every page load.
export function getCachedEditPlaylists(): SpotifyPlaylistSummary[] | null {
  const raw = localStorage.getItem(CACHE_KEY)
  if (!raw) return null
  try {
    return (JSON.parse(raw) as Cache).playlists
  } catch {
    return null
  }
}

export function setCachedEditPlaylists(playlists: SpotifyPlaylistSummary[]): void {
  const cache: Cache = { fetchedAt: Date.now(), playlists }
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

// Optimistic update after a successful save, so the cache stays useful
// without needing a full refetch.
export function updateCachedEditPlaylist(id: string, patch: Partial<SpotifyPlaylistSummary>): void {
  const playlists = getCachedEditPlaylists()
  if (!playlists) return
  setCachedEditPlaylists(playlists.map((p) => (p.id === id ? { ...p, ...patch } : p)))
}

export function clearCachedEditPlaylists(): void {
  localStorage.removeItem(CACHE_KEY)
}
