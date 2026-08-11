import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchWithRetry,
  loadSpotifyPlaylists,
  MAX_RETRY_WAIT_SECONDS,
} from './fetch-and-merge-playlists.mjs'

function headersWithRetryAfter(value) {
  return { get: (name) => (name === 'retry-after' ? value : null) }
}

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('caps the wait to MAX_RETRY_WAIT_SECONDS even when Spotify asks for much longer', async () => {
    // 74011s (~20.5h) is a real Retry-After value seen from a genuine
    // QUOTA_EXCEEDED response — blindly honoring it would hang a CI job for
    // hours, which is exactly the bug this cap fixes.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, ok: false, headers: headersWithRetryAfter('74011') })
      .mockResolvedValueOnce({ status: 200, ok: true, headers: headersWithRetryAfter(null) })
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://api.spotify.com/v1/me/playlists?limit=50', 'token')
    // If the cap didn't work, this amount of advanced time would not be
    // enough to trigger the retry and the test would time out waiting on
    // `promise` below instead of failing fast.
    await vi.advanceTimersByTimeAsync(MAX_RETRY_WAIT_SECONDS * 1000)
    const res = await promise

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after 4 retries instead of waiting forever on sustained 429s', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 429, ok: false, headers: headersWithRetryAfter('74011') })
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://api.spotify.com/v1/me', 'token')
    await vi.advanceTimersByTimeAsync(MAX_RETRY_WAIT_SECONDS * 1000 * 4)
    const res = await promise

    expect(res.status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(5) // 1 initial call + 4 retries
  })

  it('does not retry (or wait) on a non-429 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, headers: headersWithRetryAfter(null) })
    vi.stubGlobal('fetch', fetchMock)

    const res = await fetchWithRetry('https://api.spotify.com/v1/me', 'token')

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('loadSpotifyPlaylists', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  it('never calls Spotify when SKIP_LIVE_FETCH is set, even with no cache yet', async () => {
    // This repo checkout has no data/last-successful-playlists.json (gitignored,
    // build-only artifact) — exactly the state a push hits before the first
    // real fetch has ever succeeded. The fixture fallback must kick in
    // without ever touching the network, matching what actually shipped.
    process.env.SPOTIFY_CLIENT_ID = 'test-client-id'
    process.env.SPOTIFY_REFRESH_TOKEN = 'test-refresh-token'
    process.env.SKIP_LIVE_FETCH = 'true'

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const playlists = await loadSpotifyPlaylists()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(Array.isArray(playlists)).toBe(true)
    expect(playlists.length).toBeGreaterThan(0)
  })

  it('uses the fixture without calling Spotify when credentials are missing', async () => {
    delete process.env.SPOTIFY_CLIENT_ID
    delete process.env.SPOTIFY_REFRESH_TOKEN
    process.env.SKIP_LIVE_FETCH = 'false'

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const playlists = await loadSpotifyPlaylists()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(Array.isArray(playlists)).toBe(true)
    expect(playlists.length).toBeGreaterThan(0)
  })
})
