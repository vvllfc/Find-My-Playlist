import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { classifyPlaylistName } from '../src/lib/genreTaxonomy.js'
import { compareNames } from '../src/lib/naturalSort.js'

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
// not committed. Keyed by playlist ID to { trackCount, totalDurationMs,
// snapshotId }; a per-playlist fetch (the expensive part, Spotify's
// Development Mode quota is easy to exhaust with hundreds of playlists) is
// only made when the playlist's snapshot_id has actually changed since last
// time, or (once, the run this shipped) when a cached entry predates
// totalDurationMs existing at all. File name predates totalDurationMs and is
// kept as-is — renaming it would just discard the existing trackCount cache
// for no benefit, since every entry needs a refetch for the new field anyway.
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

// A playlist item wraps the actual track under a key that has moved around
// with Spotify's renames (the sub-resource itself went /tracks → /items), and
// entries for unavailable tracks come back as null. Reading whichever wrapper
// is present beats hardcoding one and silently summing zeroes.
function itemDurationMs(item) {
  const track = item?.track ?? item?.item ?? item
  return typeof track?.duration_ms === 'number' ? track.duration_ms : 0
}

// Since Spotify's February 2026 API changes, tracks.total on the playlist
// object (both the /v1/me/playlists list and GET /v1/playlists/{id} itself)
// no longer reliably reports a count — confirmed by 200 OK responses with the
// field empty. The playlist-items endpoint (the old /tracks sub-resource,
// renamed to /items) still returns an accurate `total` in its paging object.
// Total listening time isn't exposed anywhere cheap, so getting it means
// paginating every item and summing duration_ms — 100 at a time (Spotify's
// max page size) to keep the call count close to what the count-only fetch
// used to cost. Across the real catalog only ~30 playlists break 100 tracks,
// so this adds a handful of extra calls overall, not one per playlist.
//
// Deliberately no `fields` projection on the items: an earlier version asked
// for `items(track(duration_ms))` and every playlist came back with a correct
// `total` but zero duration, so the projection was filtering the durations
// away. Whole item objects are heavier, but they're only fetched when a
// playlist's snapshot_id actually changed, and being right matters more here
// than the payload size.
let loggedUnknownItemShape = false

async function fetchPlaylistStats(accessToken, playlistId) {
  let trackCount = 0
  let totalDurationMs = 0
  let itemsSeen = 0
  let sampleItem = null
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`

  while (url) {
    const res = await fetchWithRetry(url, accessToken)
    if (!res.ok) {
      console.warn(`[fetch-and-merge-playlists] playlist stats fetch failed for ${playlistId}: ${res.status} ${await res.text()}`)
      return { trackCount: 0, totalDurationMs: 0 }
    }

    const data = await res.json()
    if (typeof data.total === 'number') trackCount = data.total
    for (const item of data.items ?? []) {
      itemsSeen += 1
      sampleItem ??= item
      totalDurationMs += itemDurationMs(item)
    }
    url = data.next
  }

  // Items came back but none carried a duration — the shape changed again.
  // Logging one real sample (once for the whole run, not 480 times) makes the
  // next CI run say exactly what the response looks like, instead of leaving
  // another round of guessing at the format.
  if (itemsSeen > 0 && totalDurationMs === 0 && !loggedUnknownItemShape) {
    loggedUnknownItemShape = true
    console.warn(
      `[fetch-and-merge-playlists] ${playlistId}: ${itemsSeen} items but no duration_ms found. Sample item keys: ${JSON.stringify(Object.keys(sampleItem ?? {}))}. Sample: ${JSON.stringify(sampleItem).slice(0, 500)}`,
    )
  }

  return { trackCount, totalDurationMs }
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
        imageUrl: item.images?.[0]?.url ?? null,
        trackCount: 0,
        totalDurationMs: 0,
        externalUrl: item.external_urls?.spotify ?? `https://open.spotify.com/playlist/${item.id}`,
      })
      // snapshot_id changes whenever a playlist's tracks/order change — comes
      // free with the list response, so it's a zero-cost way to tell whether
      // a per-playlist stats call is actually worth making below.
      snapshotIds[item.id] = item.snapshot_id
    }
    url = data.next
  }

  const cache = await readTrackCountCache()
  let cacheHits = 0
  await mapWithConcurrency(playlists, 5, async (playlist) => {
    const cached = cache[playlist.id]
    const snapshotId = snapshotIds[playlist.id]
    // A playlist with tracks but no duration was cached by a run that failed
    // to read duration_ms, so it counts as a miss and gets refetched — same
    // for an entry predating the field. Only a genuinely empty playlist is
    // allowed to sit at zero.
    const cachedDurationUsable =
      cached?.totalDurationMs > 0 || (cached?.trackCount === 0 && typeof cached?.totalDurationMs === 'number')
    if (cached && cached.snapshotId === snapshotId && cachedDurationUsable) {
      playlist.trackCount = cached.trackCount
      playlist.totalDurationMs = cached.totalDurationMs
      cacheHits += 1
      return
    }
    const stats = await fetchPlaylistStats(accessToken, playlist.id)
    playlist.trackCount = stats.trackCount
    playlist.totalDurationMs = stats.totalDurationMs
    cache[playlist.id] = { trackCount: stats.trackCount, totalDurationMs: stats.totalDurationMs, snapshotId }
  })
  await writeFile(path.join(rootDir, TRACK_COUNT_CACHE_PATH), JSON.stringify(cache, null, 2))
  console.log(
    `[fetch-and-merge-playlists] playlist stats: ${cacheHits} unchanged (skipped), ${playlists.length - cacheHits} fetched from Spotify (${playlists.filter((p) => p.trackCount > 0).length} with tracks, ${playlists.filter((p) => p.totalDurationMs > 0).length} with a listening time).`,
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
  const [spotifyPlaylists, rawContent, taxonomy] = await Promise.all([
    loadSpotifyPlaylists(),
    readJson('data/site-content.json'),
    readJson('data/genre-taxonomy.json'),
  ])
  // Same defaulting as src/lib/siteContent.ts — missing sections are fine.
  const content = { folders: rawContent.folders ?? {}, playlists: rawContent.playlists ?? {} }

  // Names come from Spotify; everything editorial is ours. The description
  // shown on the site is hand-written in data/site-content.json and no longer
  // mirrors the Spotify one — the descriptions on the Spotify account are left
  // alone, they're simply not what the site displays.
  let described = 0
  let manuallyTagged = 0
  const merged = spotifyPlaylists.map((playlist) => {
    const entry = content.playlists[playlist.id]
    if (entry?.tags) manuallyTagged += 1
    if (entry?.description) described += 1
    const { category, subcategory, subsubcategory, tags, displayName } = classifyPlaylistName(playlist.name, taxonomy)
    return {
      ...playlist,
      description: entry?.description ?? '',
      category,
      subcategory,
      subsubcategory,
      displayName,
      tags: entry?.tags ?? tags,
    }
  })

  merged.sort((a, b) => compareNames(a.name, b.name))

  const uncategorized = merged.filter((p) => p.category === null).length
  const catalog = { playlists: merged, folders: content.folders }

  const outDir = path.join(rootDir, 'public', 'data')
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2))

  console.log(
    `[fetch-and-merge-playlists] ${merged.length} playlists, ${uncategorized} uncategorized, ${described} with a written description, ${manuallyTagged} with hand-written tags, ${Object.keys(content.folders).length} folder descriptions.`,
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
