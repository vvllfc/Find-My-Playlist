import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveTagsFromName } from '../src/lib/genreTaxonomy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const USER_ID = process.env.SPOTIFY_USER_ID

async function readJson(relPath) {
  const raw = await readFile(path.join(rootDir, relPath), 'utf-8')
  return JSON.parse(raw)
}

async function getAccessToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.access_token
}

async function fetchPublicPlaylists(accessToken) {
  const playlists = []
  let url = `https://api.spotify.com/v1/users/${encodeURIComponent(USER_ID)}/playlists?limit=50`

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) {
      throw new Error(`Spotify playlists request failed: ${res.status} ${await res.text()}`)
    }
    const data = await res.json()
    for (const item of data.items) {
      // Spotify pads pagination with null entries for playlists that became
      // unavailable mid-fetch; skip those and anything not actually public.
      if (!item || item.public !== true) continue
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
  if (!CLIENT_ID || !CLIENT_SECRET || !USER_ID) {
    console.warn(
      '[fetch-and-merge-playlists] SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET/SPOTIFY_USER_ID not set — using sample fixture data instead of calling Spotify.',
    )
    return readJson('data/sample-spotify-fixture.json')
  }

  const accessToken = await getAccessToken()
  return fetchPublicPlaylists(accessToken)
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
