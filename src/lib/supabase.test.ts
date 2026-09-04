import { afterEach, describe, expect, it, vi } from 'vitest'
import { auth, restFetch, SupabaseError } from './supabase'
import { SUPABASE_ANON_KEY } from '../config'

function okResponse(body: unknown = []) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
}

function signedInAs(token: string | null) {
  vi.spyOn(auth, 'getSession').mockResolvedValue({
    data: { session: token ? ({ access_token: token } as never) : null },
    error: null,
  } as never)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('restFetch', () => {
  it('sends the anon key as apikey and the user token as the bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    signedInAs('user-jwt')

    await restFetch('favorites?select=playlist_id')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://hvfzgrtfcikamyssbipc.supabase.co/rest/v1/favorites?select=playlist_id')
    expect(init.headers.apikey).toBe(SUPABASE_ANON_KEY)
    // The bearer is what row-level security reads. Sending the anon key here
    // while signed in would run every write as the anonymous role, which holds
    // no privilege on these tables at all — a silent, total failure.
    expect(init.headers.Authorization).toBe('Bearer user-jwt')
  })

  it('falls back to the anon key when nobody is signed in', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    signedInAs(null)

    await restFetch('playlist_upvote_counts?select=playlist_id,upvotes')

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${SUPABASE_ANON_KEY}`)
  })

  it('deletes by playlist alone, never by user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    signedInAs('user-jwt')

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
    signedInAs('user-jwt')

    await expect(restFetch('favorites', { method: 'POST' })).rejects.toBeInstanceOf(SupabaseError)
    await expect(restFetch('favorites', { method: 'POST' })).rejects.toMatchObject({ status: 409 })
  })
})
