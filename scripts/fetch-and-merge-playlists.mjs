import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveTagsFromName } from '../src/lib/genreTaxonomy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN

async function readJson(relPath) {
  const raw = await readFile(path.join(rootDir, relPath), 'utf-8')
  return JSON.parse(raw)
}

// Spotify's Client Credentials flow (app-only, no login) can no longer list a
// user's playlists — even public ones — as of their 2025/2026 API tightening.
// So this reuses a real user token instead: a refresh token captured once via
// the admin page's "Connecter Spotify" PKCE login (src/lib/spotifyAuth.ts) and
// stored as a repo secret. No client secret needed — same public-client
// refresh grant the browser flow already uses.
async function getAccessToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
    }),
  })
  if (!res.ok) {
    throw new Error(`Spotify token refresh failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.access_token
}

async function fetchOwnPublicPlaylists(accessToken) {
  const authHeaders = { Authorization: `Bearer ${accessToken}` }

  const meRes = await fetch('https://api.spotify.com/v1/me', { headers: authHeaders })
  if (!meRes.ok) {
    throw new Error(`Spotify /me request failed: ${meRes.status} ${await meRes.text()}`)
  }
  const me = await meRes.json()

  const playlists = []
  let url = 'https://api.spotify.com/v1/me/playlists?limit=50'

  while (url) {
    const res = await fetch(url, { headers: authHeaders })
    if (!res.ok) {
      throw new Error(`Spotify playlists request failed: ${res.status} ${await res.text()}`)
    }
    const data = await res.json()
    for (const item of data.items) {
      // Spotify pads pagination with null entries for playlists that became
      // unavailable mid-fetch; skip those, anything not public, and playlists
      // this account merely follows rather than owns.
      if (!item || item.public !== true || item.owner?.id !== me.id) continue
      playlists.push({
        id: item.id,
        name: item.name,
        imageUrl: item.images?.[0]?.url ?? null,
        trackCount: item.tracks?.total ?? 0,
        externalUrl: item.external_urls?.spotify ?? `https://open.spotify.com/playlist/${item.id}`,
      })
    }
    url = data.next
  }

  return playlists
}

async function loadSpotifyPlaylists() {
  if (!CLIENT_ID || !REFRESH_TOKEN) {
    console.warn(
      '[fetch-and-merge-playlists] SPOTIFY_CLIENT_ID/SPOTIFY_REFRESH_TOKEN not set — using sample fixture data instead of calling Spotify.',
    )
    return readJson('data/sample-spotify-fixture.json')
  }

  try {
    const accessToken = await getAccessToken()
    return await fetchOwnPublicPlaylists(accessToken)
  } catch (err) {
    // A bad/expired Spotify credential shouldn't block deploying unrelated code
    // changes — fall back to the fixture (loudly) instead of failing the whole
    // build. Re-connect via #/admin → "Configuration CI" to fix the secret.
    console.error('[fetch-and-merge-playlists] Spotify fetch failed, falling back to sample fixture data:', err)
    return readJson('data/sample-spotify-fixture.json')
  }
}

async function main() {
  const [spotifyPlaylists, meta, taxonomy] = await Promise.all([
    loadSpotifyPlaylists(),
    readJson('data/playlists.meta.json'),
    readJson('data/genre-taxonomy.json'),
  ])

  let described = 0
  const merged = spotifyPlaylists.map((playlist) => {
    const entry = meta[playlist.id]
    if (entry) described += 1
    return {
      ...playlist,
      description: entry?.description ?? '',
      tags: entry?.tags ?? deriveTagsFromName(playlist.name, taxonomy),
    }
  })

  merged.sort((a, b) => a.name.localeCompare(b.name))

  const outDir = path.join(rootDir, 'public', 'data')
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, 'playlists.json'), JSON.stringify(merged, null, 2))

  console.log(
    `[fetch-and-merge-playlists] ${merged.length} playlists fetched, ${described} with saved descriptions, ${merged.length - described} awaiting description.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
