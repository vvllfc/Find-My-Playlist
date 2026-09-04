import { useSyncExternalStore } from 'react'
import { restFetch } from './supabase'

export interface UpvoteCounts {
  /** Playlists with no vote are simply absent; a missing key reads as zero. */
  counts: ReadonlyMap<string, number>
  loaded: boolean
}

const NO_COUNTS: ReadonlyMap<string, number> = new Map()

let state: UpvoteCounts = { counts: NO_COUNTS, loaded: false }
const listeners = new Set<() => void>()

function setState(next: UpvoteCounts): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function getUpvoteCounts(): UpvoteCounts {
  return state
}

export function useUpvoteCounts(): UpvoteCounts {
  return useSyncExternalStore(subscribe, getUpvoteCounts, getUpvoteCounts)
}

let inFlight: Promise<void> | null = null

/**
 * The counts for the whole catalogue, in one request for the whole app —
 * memoised rather than fetched per caller, which is the mistake useCatalog
 * makes with a 363 kB file and which would be far worse from a row that
 * appears hundreds of times.
 *
 * Readable signed out: the view exposes a playlist id and a total, nothing
 * else. Who voted is not merely filtered out of it, it is unreachable — the
 * anonymous role holds no privilege on the underlying table at all.
 */
export function ensureLoaded(): Promise<void> {
  inFlight ??= load()
  return inFlight
}

async function load(): Promise<void> {
  try {
    const res = await restFetch('playlist_upvote_counts?select=playlist_id,upvotes')
    const rows: Array<{ playlist_id: string; upvotes: number }> = await res.json()
    setState({ counts: new Map(rows.map((row) => [row.playlist_id, row.upvotes])), loaded: true })
  } catch {
    // Silence is the right failure here. The catalogue is a static file and
    // works without a single vote; a banner about an unreachable database over
    // a site that is plainly working would be worse than a missing number.
    setState({ counts: NO_COUNTS, loaded: true })
    // Released so a later caller can try again. Held, one blip on the very
    // first load would mean no counts for the rest of the session.
    inFlight = null
  }
}

/** Moves one count by hand, so an optimistic vote shows on the row it was cast
 *  from — a vote that leaves the number alone reads as a lost click. */
export function adjust(playlistId: string, delta: number): void {
  const counts = new Map(state.counts)
  counts.set(playlistId, Math.max(0, (counts.get(playlistId) ?? 0) + delta))
  setState({ ...state, counts })
}

// Loaded once at start rather than from whichever component happens to want it
// first: every page shows rows sooner or later, and a read on each page load is
// also what keeps a free Supabase project from pausing after a week idle.
if (typeof window !== 'undefined') void ensureLoaded()
