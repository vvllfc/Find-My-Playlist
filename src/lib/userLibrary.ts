import { useSyncExternalStore } from 'react'
import { getAuthState, onAuthChange, signInWithGoogle } from './authStore'
import { restFetch } from './supabase'
import { adjust } from './upvoteCounts'

/** The two tables a visitor writes to. Both hold one row per person per
 *  playlist, so both toggle the same way — only the destination differs. */
type Shelf = 'favorites' | 'upvotes'

export interface UserLibrary {
  favoriteIds: ReadonlySet<string>
  upvotedIds: ReadonlySet<string>
  /** True while the signed-in person's rows are on their way in. */
  loading: boolean
  /** Transient; cleared by the next action that works. */
  error: string | null
}

// What someone clicked while signed out. The click is the intent; the sign-in
// is only what had to happen first, so it is carried across the round trip to
// Google rather than quietly dropped — coming back to the same unmarked row
// reads as a click that did nothing.
const PENDING_KEY = 'pending_action'

const NO_IDS: ReadonlySet<string> = new Set()
const SIGNED_OUT: UserLibrary = { favoriteIds: NO_IDS, upvotedIds: NO_IDS, loading: false, error: null }

let state: UserLibrary = SIGNED_OUT
const listeners = new Set<() => void>()

// Replaced wholesale rather than mutated, and the sets with it:
// useSyncExternalStore compares snapshots by identity, so a set changed in
// place would never repaint and a fresh object per read would never stop.
function setState(next: UserLibrary): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function getUserLibrary(): UserLibrary {
  return state
}

export function useUserLibrary(): UserLibrary {
  return useSyncExternalStore(subscribe, getUserLibrary, getUserLibrary)
}

/** The set after flipping one id — split out so both the optimistic path and
 *  the rollback path can be checked without a browser. */
export function toggled(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids)
  if (!next.delete(id)) next.add(id)
  return next
}

function idsOn(shelf: Shelf): ReadonlySet<string> {
  return shelf === 'favorites' ? state.favoriteIds : state.upvotedIds
}

function withIds(shelf: Shelf, ids: ReadonlySet<string>): UserLibrary {
  return shelf === 'favorites' ? { ...state, favoriteIds: ids } : { ...state, upvotedIds: ids }
}

// No user_id filter, here or anywhere: row-level security scopes the read to
// the caller's own rows, and asking for someone else's would return nothing
// rather than something. The server is the only thing deciding whose data this
// is, which is what makes it worth trusting.
async function loadShelves(): Promise<void> {
  setState({ ...state, loading: true })
  try {
    const [favorites, upvotes] = await Promise.all([
      restFetch('favorites?select=playlist_id').then((res) => res.json()),
      restFetch('upvotes?select=playlist_id').then((res) => res.json()),
    ])
    setState({
      favoriteIds: new Set((favorites as Array<{ playlist_id: string }>).map((row) => row.playlist_id)),
      upvotedIds: new Set((upvotes as Array<{ playlist_id: string }>).map((row) => row.playlist_id)),
      loading: false,
      error: null,
    })
  } catch {
    // Someone signed in with nothing kept and someone whose fetch failed look
    // the same on screen, deliberately: the catalogue works either way, and an
    // error banner over a feature nobody asked for yet is worse than a blank.
    setState({ ...SIGNED_OUT, loading: false })
  }
  await applyPending()
}

// Read and cleared in one go, before the write is attempted: an entry that
// survived a failure would be replayed on the next sign-in, long after anyone
// remembered clicking it.
async function applyPending(): Promise<void> {
  const pending = sessionStorage.getItem(PENDING_KEY)
  if (!pending) return
  sessionStorage.removeItem(PENDING_KEY)
  const [shelf, playlistId] = pending.split(':') as [Shelf, string]
  if (!playlistId) return
  // Already there — a blind toggle would take it straight back off.
  if (idsOn(shelf).has(playlistId)) return
  await toggle(shelf, playlistId)
}

if (typeof window !== 'undefined') {
  onAuthChange((auth) => {
    if (auth.status === 'signed-in') void loadShelves()
    else if (auth.status === 'signed-out') setState(SIGNED_OUT)
  })
}

// One counter per playlist rather than a single flag: two rows can be in flight
// at once, and a failure must undo only its own change. If a later click has
// been through since, that one is the truth and the earlier failure touches
// nothing.
const inFlight = new Map<string, number>()
let nextOp = 0

async function toggle(shelf: Shelf, playlistId: string): Promise<void> {
  // Signed out, this isn't an error to report — it's the reason to sign in.
  if (getAuthState().status !== 'signed-in') {
    sessionStorage.setItem(PENDING_KEY, `${shelf}:${playlistId}`)
    await signInWithGoogle()
    return
  }

  const before = idsOn(shelf)
  const adding = !before.has(playlistId)
  const key = `${shelf}:${playlistId}`
  const op = ++nextOp
  inFlight.set(key, op)

  setState({ ...withIds(shelf, toggled(before, playlistId)), error: null })
  if (shelf === 'upvotes') adjust(playlistId, adding ? 1 : -1)

  try {
    if (adding) {
      // user_id is filled in by the table's own default, so the request never
      // names a user — and the policy would refuse another one anyway. A repeat
      // comes back 409 from the primary key, which is the state we wanted.
      await restFetch(shelf, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ playlist_id: playlistId }),
      })
    } else {
      await restFetch(`${shelf}?playlist_id=eq.${encodeURIComponent(playlistId)}`, { method: 'DELETE' })
    }
  } catch (error) {
    // Read off the shape rather than with instanceof: a second copy of the
    // error class — from bundling, or a mocked module — would make the check
    // quietly false, and the rollback below would then undo a change the
    // server had in fact just accepted.
    if ((error as { status?: number } | null)?.status === 409) return
    if (inFlight.get(key) !== op) return
    setState({
      ...withIds(shelf, before),
      error: shelf === 'upvotes' ? "Le vote n'a pas pu être enregistré." : "Ce favori n'a pas pu être enregistré.",
    })
    if (shelf === 'upvotes') adjust(playlistId, adding ? -1 : 1)
  } finally {
    if (inFlight.get(key) === op) inFlight.delete(key)
  }
}

export function toggleFavorite(playlistId: string): Promise<void> {
  return toggle('favorites', playlistId)
}

export function toggleUpvote(playlistId: string): Promise<void> {
  return toggle('upvotes', playlistId)
}
