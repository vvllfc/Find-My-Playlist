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

export async function updatePlaylistDetails(
  accessToken: string,
  playlistId: string,
  details: { name?: string; description?: string },
): Promise<void> {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(details),
  })
  if (!res.ok) {
    throw new Error(`Spotify playlist update failed: ${res.status} ${await res.text()}`)
  }
}
