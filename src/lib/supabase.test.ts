import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SUPABASE_ANON_KEY } from '../config'

function okResponse(body: unknown = []) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
}

/** Counts how often the auth client is actually reached for, which is the whole
 *  point of the storage probe: a visitor who never signs in must never pull it. */
let clientBuilds = 0

/**
 * A fresh copy of the module with storage in a known state. The auth package is
 * replaced so the dynamic import resolves without touching the real one, and so
 * building a client is observable.
 */
async function freshSupabase(storedToken: string | null) {
  vi.resetModules()
  clientBuilds = 0
  const entries = new Map<string, string>()
  if (storedToken) entries.set('sb-hvfzgrtfcikamyssbipc-auth-token', 'anything')
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  })
  vi.doMock('@supabase/auth-js', () => ({
    GoTrueClient: class {
      constructor() {
        clientBuilds += 1
      }
      async getSession() {
        return { data: { session: storedToken ? { access_token: storedToken } : null }, error: null }
      }
    },
  }))
  return import('./supabase')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.resetModules()
})

describe('hasStoredSession', () => {
  it('answers from storage alone, without building a client', async () => {
    const { hasStoredSession } = await freshSupabase('user-jwt')
    expect(hasStoredSession()).toBe(true)
    expect(clientBuilds).toBe(0)
  })

  it('treats blocked storage as signed out rather than throwing', async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage blocked')
      },
    })
    const { hasStoredSession } = await import('./supabase')
    // Signing in would not work either, so this is both true and the only thing
    // left to do — and it must not take the whole module down on the way.
    expect(hasStoredSession()).toBe(false)
  })
})

describe('restFetch', () => {
  it('sends the anon key as apikey and the user token as the bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { restFetch } = await freshSupabase('user-jwt')

    await restFetch('favorites?select=playlist_id')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://hvfzgrtfcikamyssbipc.supabase.co/rest/v1/favorites?select=playlist_id')
    expect(init.headers.apikey).toBe(SUPABASE_ANON_KEY)
    // The bearer is what row-level security reads. Sending the anon key here
    // while signed in would run every write as the anonymous role, which holds
    // no privilege on these tables at all — a silent, total failure.
    expect(init.headers.Authorization).toBe('Bearer user-jwt')
  })

  it('never loads the auth client for a visitor with no session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { restFetch } = await freshSupabase(null)

    await restFetch('playlist_upvote_counts?select=playlist_id,upvotes')

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${SUPABASE_ANON_KEY}`)
    // The public counts are readable with the anon key, so pulling seventeen
    // kilobytes of token-refresh machinery to be told there is no token would
    // be pure waste — and this is the assertion that keeps it that way.
    expect(clientBuilds).toBe(0)
  })

  it('deletes by playlist alone, never by user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { restFetch } = await freshSupabase('user-jwt')

    await restFetch('favorites?playlist_id=eq.abc', { method: 'DELETE' })

    // Scoping the delete to the caller is the database's job, not the client's:
    // a user_id sent from here would be a claim, and the policy ignores claims.
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('playlist_id=eq.abc')
    expect(url).not.toContain('user_id')
    expect(init.method).toBe('DELETE')
  })

  it('raises a SupabaseError carrying the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => 'duplicate key' }),
    )
    const { restFetch, SupabaseError } = await freshSupabase('user-jwt')

    await expect(restFetch('favorites', { method: 'POST' })).rejects.toBeInstanceOf(SupabaseError)
    await expect(restFetch('favorites', { method: 'POST' })).rejects.toMatchObject({ status: 409 })
  })
})
