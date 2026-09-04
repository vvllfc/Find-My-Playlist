import { beforeEach, describe, expect, it, vi } from 'vitest'

// The store keeps module state, so each test gets a fresh copy of it.
async function freshLibrary(restFetch: ReturnType<typeof vi.fn>, signedIn = true) {
  vi.resetModules()
  const signInWithGoogle = vi.fn()
  Reflect.set(globalThis, '__signIn', signInWithGoogle)
  vi.doMock('./authStore', () => ({
    getAuthState: () => ({
      status: signedIn ? 'signed-in' : 'signed-out',
      userId: signedIn ? 'u1' : null,
      email: signedIn ? 'a@b.c' : null,
    }),
    onAuthChange: () => () => {},
    signInWithGoogle,
  }))
  vi.doMock('./supabase', () => ({
    restFetch,
    SupabaseError: class extends Error {
      status: number
      constructor(message: string, status: number) {
        super(message)
        this.status = status
      }
    },
  }))
  return import('./userLibrary')
}

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

beforeEach(() => {
  vi.resetModules()
})

describe('toggled', () => {
  it('adds what is missing and removes what is there', () => {
    // Imported directly: it is pure, and it is the piece both the optimistic
    // path and the rollback path lean on.
    return import('./userLibrary').then(({ toggled }) => {
      expect(toggled(new Set(['a']), 'b')).toEqual(new Set(['a', 'b']))
      expect(toggled(new Set(['a', 'b']), 'a')).toEqual(new Set(['b']))
    })
  })

  it('leaves the set it was given alone', () => {
    return import('./userLibrary').then(({ toggled }) => {
      const original = new Set(['a'])
      toggled(original, 'b')
      expect(original).toEqual(new Set(['a']))
    })
  })
})

describe('toggleFavorite', () => {
  it('shows the change before the request finishes', async () => {
    const gate = deferred()
    const restFetch = vi.fn().mockReturnValue(gate.promise)
    const { toggleFavorite, getUserLibrary } = await freshLibrary(restFetch)

    const pending = toggleFavorite('abc')
    expect(getUserLibrary().favoriteIds.has('abc')).toBe(true)

    gate.resolve()
    await pending
    expect(getUserLibrary().favoriteIds.has('abc')).toBe(true)
  })

  it('puts the previous state back when the write fails', async () => {
    const restFetch = vi.fn().mockRejectedValue(new Error('offline'))
    const { toggleFavorite, getUserLibrary } = await freshLibrary(restFetch)

    await toggleFavorite('abc')

    expect(getUserLibrary().favoriteIds.has('abc')).toBe(false)
    expect(getUserLibrary().error).toBeTruthy()
  })

  it('treats a duplicate as the state that was wanted', async () => {
    // 409 is the primary key refusing a second identical row. The row is there,
    // which is the whole point of the click — undoing it would be wrong.
    const restFetch = vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { status: 409 }))
    const { toggleFavorite, getUserLibrary } = await freshLibrary(restFetch)

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

    // The later click is the truth; rolling the failure back would have put
    // the bookmark on again behind the visitor.
    expect(getUserLibrary().favoriteIds.has('abc')).toBe(false)
  })
})

describe('a bookmark clicked while signed out', () => {
  beforeEach(() => {
    // The store reaches for sessionStorage, which node has no notion of.
    const entries = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    })
  })

  it('starts a sign-in and keeps the id for afterwards', async () => {
    const restFetch = vi.fn()
    const { toggleFavorite } = await freshLibrary(restFetch, false)

    await toggleFavorite('abc')

    // Nothing is written while signed out: the anonymous role holds no
    // privilege on this table, so the request could only come back 401.
    expect(restFetch).not.toHaveBeenCalled()
    expect(Reflect.get(globalThis, '__signIn')).toHaveBeenCalled()
    // Carried across the trip to Google, so the click lands on return rather
    // than leaving the visitor in front of the row they just clicked.
    expect(sessionStorage.getItem('pending_favorite')).toBe('abc')
  })
})
