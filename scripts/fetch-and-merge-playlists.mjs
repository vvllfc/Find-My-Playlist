import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deriveTagsFromName } from '../src/lib/genreTaxonomy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// Read at call time (not module load time) so tests can flip these via
// process.env between calls without needing to bust the module cache.
function getEnv() {
  return {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    refreshToken: process.env.SPOTIFY_REFRESH_TOKEN,
    skipLiveFetch: process.env.SKIP_LIVE_FETCH === 'true',
  }
}

// Gitignored, persisted between CI runs via actions/cache (see deploy.yml) —
// not committed. Keyed by playlist ID to { trackCount, snapshotId }; a
// per-playlist track-count call (the expensive part, Spotify's Development
// Mode quota is easy to exhaust with hundreds of playlists) is only made
// when the playlist's snapshot_id has actually changed since last time.
const TRACK_COUNT_CACHE_PATH = 'data/track-counts-cache.json'

// Same persistence mechanism, holding the last successfully fetched playlist
// list. On a failed fetch (e.g. Spotify quota exhausted) this is used instead
// of the fixture, so a transient API outage doesn't replace real playlists
// with 6 sample ones on the live site — the fixture is only for when there's
// no real data at all yet.
const LAST_GOOD_PLAYLISTS_PATH = 'data/last-successful-playlists.json'

async function readJson(relPath) {
  const raw = await readFile(path.join(rootDir, relPath), 'utf-8')
  return JSON.parse(raw)
}

async function readTrackCountCache() {
  try {
    return await readJson(TRACK_COUNT_CACHE_PATH)
  } catch {
    return {}
  }
}

// Spotify's Client Credentials flow (app-only, no login) can no longer list a
// user's playlists — even public ones — as of their 2025/2026 API tightening.
// So this reuses a real user token instead: a refresh token captured once via
// the admin page's "Connecter Spotify" PKCE login (src/lib/spotifyAuth.ts) and
// stored as a repo secret. No client secret needed — same public-client
// refresh grant the browser flow already uses.
async function getAccessToken(clientId, refreshToken) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  })
  if (!res.ok) {
    throw new Error(`Spotify token refresh failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.access_token
}

// Runs `fn` over `items` with at most `limit` calls in flight at once.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// Retries on 429 (respecting Retry-After when Spotify sends one, but capped —
// see below) for ANY Spotify call, not just the per-playlist track-count one.
// This only helps with a short-window rate limit; a Development Mode *quota*
// exhaustion (a 429 with reason "QUOTA_EXCEEDED") sends a Retry-After that can
// be tens of thousands of seconds (a literal "come back tomorrow"), and
// blindly sleeping that long would hang the whole CI job for hours. Cap the
// wait per attempt so a handful of quick retries either clear a transient
// rate limit or fail fast — reducing total call volume is the only real fix
// for genuine quota exhaustion (see SKIP_LIVE_FETCH and the snapshot_id cache).
const MAX_RETRY_WAIT_SECONDS = 30

async function fetchWithRetry(url, accessToken, attempt = 0) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })

  if (res.status === 429 && attempt < 4) {
    const retryAfterSeconds = Math.min(Number(res.headers.get('retry-after')) || 2 ** attempt, MAX_RETRY_WAIT_SECONDS)
    console.warn(`[fetch-and-merge-playlists] 429 on ${url}, waiting ${retryAfterSeconds}s (attempt ${attempt + 1}/4)`)
    await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000))
    return fetchWithRetry(url, accessToken, attempt + 1)
  }

  return res
}

// Since Spotify's February 2026 API changes, tracks.total on the playlist
// object (both the /v1/me/playlists list and GET /v1/playlists/{id} itself)
// no longer reliably reports a count — confirmed by 200 OK responses with the
// field empty. The playlist-items endpoint (the old /tracks sub-resource,
// renamed to /items) still returns an accurate `total` in its paging object,
// so use that instead, asking for just 1 item to keep the payload tiny.
async function fetchTrackCount(accessToken, playlistId) {
  const res = await fetchWithRetry(`https://api.spotify.com/v1/playlists/${playlistId}/items?limit=1&fields=total`, accessToken)

  if (!res.ok) {
    console.warn(`[fetch-and-merge-playlists] track count fetch failed for ${playlistId}: ${res.status} ${await res.text()}`)
    return 0
  }

  const data = await res.json()
  if (typeof data.total !== 'number') {
    console.warn(`[fetch-and-merge-playlists] track count missing in response for ${playlistId}: ${JSON.stringify(data)}`)
    return 0
  }
  return data.total
}

async function fetchOwnPublicPlaylists(accessToken) {
  const meRes = await fetchWithRetry('https://api.spotify.com/v1/me', accessToken)
  if (!meRes.ok) {
    throw new Error(`Spotify /me request failed: ${meRes.status} ${await meRes.text()}`)
  }
  const me = await meRes.json()

  const playlists = []
  const snapshotIds = {}
  let url = 'https://api.spotify.com/v1/me/playlists?limit=50'

  while (url) {
    const res = await fetchWithRetry(url, accessToken)
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
        description: item.description ?? '',
        imageUrl: item.images?.[0]?.url ?? null,
        trackCount: 0,
        externalUrl: item.external_urls?.spotify ?? `https://open.spotify.com/playlist/${item.id}`,
      })
      // snapshot_id changes whenever a playlist's tracks/order change — comes
      // free with the list response, so it's a zero-cost way to tell whether
      // a per-playlist track-count call is actually worth making below.
      snapshotIds[item.id] = item.snapshot_id
    }
    url = data.next
  }

  const cache = await readTrackCountCache()
  let cacheHits = 0
  await mapWithConcurrency(playlists, 5, async (playlist) => {
    const cached = cache[playlist.id]
    const snapshotId = snapshotIds[playlist.id]
    if (cached && cached.snapshotId === snapshotId) {
      playlist.trackCount = cached.trackCount
      cacheHits += 1
      return
    }
    playlist.trackCount = await fetchTrackCount(accessToken, playlist.id)
    cache[playlist.id] = { trackCount: playlist.trackCount, snapshotId }
  })
  await writeFile(path.join(rootDir, TRACK_COUNT_CACHE_PATH), JSON.stringify(cache, null, 2))
  console.log(
    `[fetch-and-merge-playlists] track counts: ${cacheHits} unchanged (skipped), ${playlists.length - cacheHits} fetched from Spotify (${playlists.filter((p) => p.trackCount > 0).length} non-zero total).`,
  )

  return playlists
}

async function loadSpotifyPlaylists() {
  const { clientId, refreshToken, skipLiveFetch } = getEnv()

  if (!clientId || !refreshToken) {
    console.warn(
      '[fetch-and-merge-playlists] SPOTIFY_CLIENT_ID/SPOTIFY_REFRESH_TOKEN not set — using sample fixture data instead of calling Spotify.',
    )
    return readJson('data/sample-spotify-fixture.json')
  }

  if (skipLiveFetch) {
    // A plain code push must NEVER call Spotify — reuse the last successful
    // fetch instead. Real refreshes only happen on the daily cron or the
    // admin's manual button (see deploy.yml, which only sets
    // SKIP_LIVE_FETCH=true for push events). If there's no cache yet either
    // (e.g. it hasn't been seeded since a cache-key change, or quota has been
    // exhausted for a while), fall back to the fixture — NOT a live call —
    // so a push can never end up waiting on Spotify's rate limit.
    try {
      const cached = await readJson(LAST_GOOD_PLAYLISTS_PATH)
      console.log(
        `[fetch-and-merge-playlists] Skipping live Spotify fetch for this push — reusing cached playlist list (${cached.length} playlists).`,
      )
      return cached
    } catch {
      console.warn(
        '[fetch-and-merge-playlists] SKIP_LIVE_FETCH set but no cached playlist list yet — using sample fixture data (still never calling Spotify on a push).',
      )
      return readJson('data/sample-spotify-fixture.json')
    }
  }

  try {
    const accessToken = await getAccessToken(clientId, refreshToken)
    const playlists = await fetchOwnPublicPlaylists(accessToken)
    await writeFile(path.join(rootDir, LAST_GOOD_PLAYLISTS_PATH), JSON.stringify(playlists, null, 2))
    return playlists
  } catch (err) {
    // A bad/expired Spotify credential or exhausted quota shouldn't block
    // deploying unrelated code changes, nor wipe real playlists off the live
    // site — fall back to the last successful fetch if we have one, and only
    // to the sample fixture if we've never fetched real data at all.
    console.error('[fetch-and-merge-playlists] Spotify fetch failed:', err)
    try {
      const cached = await readJson(LAST_GOOD_PLAYLISTS_PATH)
      console.warn(
        `[fetch-and-merge-playlists] Using last known good playlist list (${cached.length} playlists) instead of live Spotify data.`,
      )
      return cached
    } catch {
      console.warn(
        '[fetch-and-merge-playlists] No cached playlist list available either — falling back to sample fixture data.',
      )
      return readJson('data/sample-spotify-fixture.json')
    }
  }
}

async function main() {
  const [spotifyPlaylists, meta, taxonomy] = await Promise.all([
    loadSpotifyPlaylists(),
    readJson('data/playlists.meta.json'),
    readJson('data/genre-taxonomy.json'),
  ])

  // The description is the real Spotify one (already on `playlist`, fetched
  // live above) — it just follows whatever's on Spotify. Only tags are a
  // site-only concept, hand-authored in data/playlists.meta.json.
  let tagged = 0
  const merged = spotifyPlaylists.map((playlist) => {
    const entry = meta[playlist.id]
    if (entry) tagged += 1
    return {
      ...playlist,
      description: playlist.description ?? '',
      tags: entry?.tags ?? deriveTagsFromName(playlist.name, taxonomy),
    }
  })

  merged.sort((a, b) => a.name.localeCompare(b.name))

  const outDir = path.join(rootDir, 'public', 'data')
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, 'playlists.json'), JSON.stringify(merged, null, 2))

  console.log(
    `[fetch-and-merge-playlists] ${merged.length} playlists fetched, ${tagged} with saved tags, ${merged.length - tagged} awaiting tags.`,
  )
}

// Only run when executed directly (`node scripts/fetch-and-merge-playlists.mjs`),
// not when imported by tests. pathToFileURL handles Windows drive letters/spaces
// correctly, unlike a hand-rolled `file://${path}` string.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}

export { fetchWithRetry, loadSpotifyPlaylists, MAX_RETRY_WAIT_SECONDS }
