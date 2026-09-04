import { useSyncExternalStore } from 'react'
import { onAuthChange } from './authStore'
import { restFetch } from './supabase'

export interface Profile {
  displayName: string
  /** Whether this person's votes carry their name in public. */
  votesPublic: boolean
}

export interface ProfileState extends Profile {
  loading: boolean
  saving: boolean
  error: string | null
}

/** Closed, and nameless, until someone says otherwise. Mirrors the table's own
 *  defaults so a profile that has never been saved reads the same either way. */
const BLANK: ProfileState = {
  displayName: '',
  votesPublic: false,
  loading: false,
  saving: false,
  error: null,
}

export const DISPLAY_NAME_MAX = 40

let state: ProfileState = BLANK
const listeners = new Set<() => void>()

function setState(next: ProfileState): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function getProfile(): ProfileState {
  return state
}

export function useProfile(): ProfileState {
  return useSyncExternalStore(subscribe, getProfile, getProfile)
}

/**
 * What the table will accept: trimmed, inner runs of space collapsed, and no
 * longer than the CHECK allows.
 *
 * The collapsing is not cosmetic. The unique index compares
 * lower(regexp_replace(btrim(name), '\s+', ' ', 'g')), so a name saved
 * with a double space would be stored one way and matched another — the
 * server would reject a name the page had already shown as free. Normalising
 * here to the same shape keeps the two in step.
 *
 * Pure, so the rule can be checked without a browser or a database.
 */
export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, DISPLAY_NAME_MAX)
}

/** Publishing a vote means publishing a name beside it, so there has to be one.
 *  The view drops nameless profiles anyway; refusing here says why. */
export function canGoPublic(displayName: string): boolean {
  return normalizeDisplayName(displayName).length > 0
}

/** The word that has to be typed out before an account can be deleted. */
export const DELETE_CONFIRMATION = 'SUPPRIMER'

/**
 * Whether what was typed releases the delete button. Case and surrounding
 * space are forgiven: the safeguard is the deliberate act of typing nine
 * letters, not the shift key. What it rules out is the accident — the two-step
 * confirm it replaces put its second button where the first had just been, so
 * a double-click or a mistimed tap on a phone went through both.
 */
export function confirmsDeletion(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_CONFIRMATION
}

async function loadProfile(): Promise<void> {
  setState({ ...state, loading: true })
  try {
    const res = await restFetch('profiles?select=display_name,votes_public')
    const rows: Array<{ display_name: string | null; votes_public: boolean }> = await res.json()
    // No row yet is the ordinary case, not an error: a profile is created the
    // first time someone saves one, rather than by a trigger reaching into the
    // auth schema on every signup.
    const row = rows[0]
    setState({
      displayName: row?.display_name ?? '',
      votesPublic: row?.votes_public ?? false,
      loading: false,
      saving: false,
      error: null,
    })
  } catch {
    setState({ ...BLANK, loading: false })
  }
}

if (typeof window !== 'undefined') {
  onAuthChange((auth) => {
    if (auth.status === 'signed-in') void loadProfile()
    else if (auth.status === 'signed-out') setState(BLANK)
  })
}

/**
 * Writes the whole profile in one upsert. The row is keyed by the person's own
 * id, which the policy pins to auth.uid(), so there is no way to write anyone
 * else's — the id is sent because the primary key needs it, not because it is
 * trusted.
 */
export async function saveProfile(userId: string, next: Profile): Promise<boolean> {
  const displayName = normalizeDisplayName(next.displayName)
  // A public vote with no name beside it is just a leak, and the view would
  // drop it anyway — better to refuse than to save a setting that does nothing.
  const votesPublic = next.votesPublic && displayName.length > 0

  setState({ ...state, saving: true, error: null })
  try {
    await restFetch('profiles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Upsert: the row may not exist yet, and saving twice must not fail on
        // the primary key.
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: userId,
        display_name: displayName || null,
        votes_public: votesPublic,
        updated_at: new Date().toISOString(),
      }),
    })
    setState({ displayName, votesPublic, loading: false, saving: false, error: null })
    return true
  } catch (error) {
    // 409 here is the unique index on the name, not the primary key: the
    // upsert already resolves that one. Read off the shape rather than with
    // instanceof, for the same reason the vote toggle does.
    const taken = (error as { status?: number } | null)?.status === 409
    setState({
      ...state,
      saving: false,
      error: taken
        ? "Ce nom est déjà pris. Choisis-en un autre."
        : "Le profil n'a pas pu être enregistré.",
    })
    return false
  }
}

/**
 * Removes everything this person has here — favourites, votes, profile — and
 * then the account itself, through a function that can only ever delete its own
 * caller. The three tables cascade from it, so this one call is the whole
 * erasure rather than a sequence that could stop halfway.
 */
export async function deleteOwnAccount(): Promise<boolean> {
  try {
    await restFetch('rpc/delete_own_account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    return true
  } catch {
    setState({ ...state, error: "Le compte n'a pas pu être supprimé." })
    return false
  }
}
