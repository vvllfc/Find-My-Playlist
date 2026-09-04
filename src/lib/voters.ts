import { useSyncExternalStore } from 'react'
import { restFetch } from './supabase'

export interface Voter {
  userId: string
  displayName: string
}

export type VoterList = { status: 'loading' } | { status: 'ready'; voters: Voter[] } | { status: 'failed' }

// Keyed by playlist, filled only for the ones actually opened. Fetching voters
// for every row on screen would be hundreds of profiles nobody asked to see —
// the count on the row is what people read, the names are what they click for.
let lists = new Map<string, VoterList>()
const listeners = new Set<() => void>()

function setLists(next: Map<string, VoterList>): void {
  lists = next
  for (const listener of listeners) listener()
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function snapshot(): Map<string, VoterList> {
  return lists
}

export function useVoters(playlistId: string): VoterList | undefined {
  return useSyncExternalStore(subscribe, snapshot, snapshot).get(playlistId)
}

/**
 * The people who voted for one playlist AND chose to be seen. Everyone else is
 * absent — not hidden by this query, but unreachable: the view itself only ever
 * contains rows whose author asked for them to be public, and the underlying
 * table grants nothing to anyone.
 *
 * Fetched once per playlist and kept, so opening and closing the same row does
 * not ask again.
 */
export async function loadVoters(playlistId: string): Promise<void> {
  if (lists.has(playlistId)) return
  setLists(new Map(lists).set(playlistId, { status: 'loading' }))
  try {
    const res = await restFetch(
      `playlist_public_voters?select=user_id,display_name&playlist_id=eq.${encodeURIComponent(playlistId)}`,
    )
    const rows: Array<{ user_id: string; display_name: string }> = await res.json()
    const voters = rows.map((row) => ({ userId: row.user_id, displayName: row.display_name }))
    setLists(new Map(lists).set(playlistId, { status: 'ready', voters }))
  } catch {
    // Kept as a failure rather than as an empty list: "personne n'a rendu son
    // vote public" and "la requête a échoué" are different sentences, and
    // showing the first when the second happened would be a lie.
    setLists(new Map(lists).set(playlistId, { status: 'failed' }))
  }
}

/** Dropped after a vote so the next open re-reads it — the list the visitor
 *  just joined or left would otherwise be the stale one. */
export function forgetVoters(playlistId: string): void {
  if (!lists.has(playlistId)) return
  const next = new Map(lists)
  next.delete(playlistId)
  setLists(next)
}
