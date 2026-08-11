export interface SpotifyPlaylistSummary {
  id: string
  name: string
  description: string
  imageUrl: string | null
  isPublic: boolean
  trackCount: number
  externalUrl: string
}

export async function fetchMyPlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
  const playlists: SpotifyPlaylistSummary[] = []
  let url: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50'

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) {
      throw new Error(`Spotify playlists request failed: ${res.status} ${await res.text()}`)
    }
    const data = await res.json()
    for (const item of data.items) {
      if (!item) continue
      playlists.push({
        id: item.id,
        name: item.name,
        description: item.description ?? '',
        imageUrl: item.images?.[0]?.url ?? null,
        isPublic: item.public === true,
        trackCount: item.tracks?.total ?? 0,
        externalUrl: item.external_urls?.spotify ?? `https://open.spotify.com/playlist/${item.id}`,
      })
    }
    url = data.next
  }

  return playlists
}

// Fetches a playlist's current name fresh from Spotify, right before offering
// it for editing: the public catalog's static JSON is a snapshot from the last
// build and the name may have moved since. One light call per edit, not one
// per playlist in the list.
export async function fetchPlaylistName(accessToken: string, playlistId: string): Promise<string> {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Spotify playlist name request failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.name ?? ''
}

// Sends `name` and nothing else, deliberately. Spotify's change-details
// endpoint only touches the fields present in the body, so leaving description
// out is what keeps the descriptions on the Spotify account untouched — the
// site sources its own from data/site-content.json now, but that must not
// reach back and clear what's on Spotify.
export async function renamePlaylist(accessToken: string, playlistId: string, name: string): Promise<void> {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    throw new Error(`Spotify playlist rename failed: ${res.status} ${await res.text()}`)
  }
}
