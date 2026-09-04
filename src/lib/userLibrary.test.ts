import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A promise plus the handles to settle it, so a request can be held open. */
function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res as () => void
    reject = rej
  })
  return { promise, resolve, reject }
}

// The store keeps module state, so each test gets a fresh copy of it. The two
// modules it leans on are replaced: authStore so the signed-in answer is fixed,
// supabase so no request leaves, upvoteCounts so the public number can be
// watched moving.
async function freshLibrary(restFetch: ReturnType<typeof vi.fn>, signedIn = true) {
  vi.resetModules()
  const signInWithGoogle = vi.fn()
  const adjust = vi.fn()
  Reflect.set(globalThis, '__signIn', signInWithGoogle)
  Reflect.set(globalThis, '__adjust', adjust)
  vi.doMock('./authStore', () => ({
    getAuthState: () => ({
      status: signedIn ? 'signed-in' : 'signed-out',
      userId: signedIn ? 'u1' : null,
      email: signedIn ? 'a@b.c' : null,
    }),
    onAuthChange: () => () => {},
    signInWithGoogle,
  }))
  vi.doMock('./supabase', () => ({ restFetch }))
  vi.doMock('./upvoteCounts', () => ({ adjust }))
  return import('./userLibrary')
}

beforeEach(() => {
  vi.resetModules()
  const entries = new Map<string, string>()
  // The store reaches for sessionStorage, which node has no notion of.
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  })
})

describe('toggled', () => {
  it('adds what is missing and removes what is there', async () => {
    // Imported directly: it is pure, and both the optimistic path and the
    // rollback path lean on it.
    const { toggled } = await import('./userLibrary')
    expect(toggled(new Set(['a']), 'b')).toEqual(new Set(['a', 'b']))
    expect(toggled(new Set(['a', 'b']), 'a')).toEqual(new Set(['b']))
  })

  it('leaves the set it was given alone', async () => {
    const { toggled } = await import('./userLibrary')
    const original = new Set(['a'])
    toggled(original, 'b')
    expect(original).toEqual(new Set(['a']))
  })
})

describe('toggleFavorite', () => {
  it('shows the change before the request finishes', async () => {
    const gate = deferred()
    const { toggleFavorite, getUserLibrary } = await freshLibrary(vi.fn().mockReturnValue(gate.promise))

    const pending = toggleFavorite('abc')
    expect(getUserLibrary().favoriteIds.has('abc')).toBe(true)

    gate.resolve()
    await pending
    expect(getUserLibrary().favoriteIds.has('abc')).toBe(true)
  })

  it('puts the previous state back when the write fails', async () => {
    const { toggleFavorite, getUserLibrary } = await freshLibrary(vi.fn().mockRejectedValue(new Error('offline')))

    await toggleFavorite('abc')

    expect(getUserLibrary().favoriteIds.has('abc')).toBe(false)
    expect(getUserLibrary().error).toBeTruthy()
  })

  it('treats a duplicate as the state that was wanted', async () => {
    // 409 is the primary key refusing a second identical row. The row is there,
    // which is the whole point of the click — undoing it would be wrong.
    const conflict = Object.assign(new Error('duplicate'), { status: 409 })
    const { toggleFavorite, getUserLibrary } = await freshLibrary(vi.fn().mockRejectedValue(conflict))

    await toggleFavorite('abc')

    expect(getUserLibrary().favoriteIds.has('abc')).toBe(true)
    expect(getUserLibrary().error).toBeNull()
  })

  it('lets a newer click win over an older failure', async () => {
    const first = deferred()
    const restFetch = vi
      .fn()
      .mockReturnValueOnce(first.promise) // the add, held open, doomed to fail
      .mockResolvedValueOnce(undefined) // the remove that overtakes it
    const { toggleFavorite, getUserLibrary } = await freshLibrary(restFetch)

    const doomed = toggleFavorite('abc')
    expect(getUserLibrary().favoriteIds.has('abc')).toBe(true)

    await toggleFavorite('abc')
    expect(getUserLibrary().favoriteIds.has('abc')).toBe(false)

    first.reject(new Error('offline'))
    await doomed

    // The later click is the truth; rolling the failure back would have put the
    // bookmark on again behind the visitor.
    expect(getUserLibrary().favoriteIds.has('abc')).toBe(false)
  })
})

describe('toggleUpvote', () => {
  it('writes to upvotes, not to favourites', async () => {
    const restFetch = vi.fn().mockResolvedValue(undefined)
    const { toggleUpvote, getUserLibrary } = await freshLibrary(restFetch)

    await toggleUpvote('abc')

    expect(restFetch.mock.calls[0][0]).toBe('upvotes')
    expect(getUserLibrary().upvotedIds.has('abc')).toBe(true)
    expect(getUserLibrary().favoriteIds.has('abc')).toBe(false)
  })

  it('moves the public count with the button', async () => {
    const { toggleUpvote } = await freshLibrary(vi.fn().mockResolvedValue(undefined))

    await toggleUpvote('abc')

    // A vote that leaves the number where it was reads as a lost click.
    expect(Reflect.get(globalThis, '__adjust')).toHaveBeenCalledWith('abc', 1)
  })

  it('puts the count back when the write fails', async () => {
    const { toggleUpvote, getUserLibrary } = await freshLibrary(vi.fn().mockRejectedValue(new Error('offline')))

    await toggleUpvote('abc')

    expect(getUserLibrary().upvotedIds.has('abc')).toBe(false)
    const adjust = Reflect.get(globalThis, '__adjust') as ReturnType<typeof vi.fn>
    expect(adjust.mock.calls).toEqual([
      ['abc', 1],
      ['abc', -1],
    ])
  })
})

describe('a click made while signed out', () => {
  it('starts a sign-in and keeps the action for afterwards', async () => {
    const restFetch = vi.fn()
    const { toggleUpvote } = await freshLibrary(restFetch, false)

    await toggleUpvote('abc')

    // Nothing is written while signed out: the anonymous role holds no
    // privilege on this table, so the request could only come back 401.
    expect(restFetch).not.toHaveBeenCalled()
    expect(Reflect.get(globalThis, '__signIn')).toHaveBeenCalled()
    // The shelf travels with the id, so the right one is replayed on return.
    expect(sessionStorage.getItem('pending_action')).toBe('upvotes:abc')
  })
})
