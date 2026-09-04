import { useSyncExternalStore } from 'react'
import { runFolderTransition, type FolderPivot } from './folderTransition'

// Public pages use real paths (/genre/techno) so shared links stay clean.
// The two private pages deliberately stay on hash routes — they're never part
// of the site's path structure, and a hash is never sent to the server.
//
// GitHub Pages has no SPA rewrite setting, so the build ships dist/404.html as
// a copy of index.html (see vite.config.ts): a cold deep link to /genre/techno
// is served that copy and boots the app, which then routes on the pathname.

export type Route =
  | { kind: 'admin' }
  | { kind: 'modify' }
  | { kind: 'glossary' }
  | { kind: 'authCallback' }
  | { kind: 'favorites' }
  | { kind: 'account' }
  | { kind: 'catalog'; segments: string[] }

export const GLOSSARY_PATH = '/glossaire'

// A landing path of its own, and above all not '/': it is what tells the Google
// return apart from the Spotify one, whose redirect_uri is registered verbatim
// as the bare site root and cannot move without re-registering (see App.tsx).
export const AUTH_CALLBACK_PATH = '/connexion'

export const FAVORITES_PATH = '/favoris'

export const ACCOUNT_PATH = '/compte'

export function parseRoute(location: string): Route {
  const hashIndex = location.indexOf('#')
  const pathname = hashIndex === -1 ? location : location.slice(0, hashIndex)
  const hash = hashIndex === -1 ? '' : location.slice(hashIndex + 1)

  if (hash.startsWith('/admin')) return { kind: 'admin' }
  if (hash.startsWith('/modify')) return { kind: 'modify' }

  const segments = pathname.split('/').filter(Boolean)
  // A public page of its own rather than a catalog segment: it lists no
  // playlists, so none of the folder machinery applies to it.
  if (segments.length === 1 && segments[0] === 'glossaire') return { kind: 'glossary' }
  // Nothing to look at: it exists to catch Google's redirect and move on.
  if (segments.length === 1 && segments[0] === 'connexion') return { kind: 'authCallback' }
  if (segments.length === 1 && segments[0] === 'favoris') return { kind: 'favorites' }
  if (segments.length === 1 && segments[0] === 'compte') return { kind: 'account' }
  return { kind: 'catalog', segments }
}

// How deep into the folder hierarchy a catalog route sits: the folder grid is
// 0, a folder is 1, a sub-folder is 2, a sub-sub-folder (Rap Game's language →
// school) is 3. Anything that isn't a catalog route has no depth of its own.
function depthOf(route: Route): number | null {
  if (route.kind !== 'catalog') return null
  if (route.segments[0] !== 'genre') return route.segments.length === 0 ? 0 : null
  const depth = route.segments.length - 1
  return depth >= 1 && depth <= 3 ? depth : null
}

/**
 * The folder a navigation pivots around — the tile the grid pushes away from,
 * or settles back around. Null when the move isn't a single step up or down
 * the hierarchy (search, private pages, a two-level jump), which leaves no
 * single tile to anchor the movement.
 */
export function pivotBetween(from: string, to: string): FolderPivot | null {
  const fromDepth = depthOf(parseRoute(from))
  const toDepth = depthOf(parseRoute(to))
  if (fromDepth === null || toDepth === null) return null
  if (Math.abs(toDepth - fromDepth) !== 1) return null

  // Whichever side is deeper names the anchor tile — going down it's the folder
  // we're entering, coming back up it's the one we're leaving.
  const goingDeeper = toDepth > fromDepth
  const segments = (parseRoute(goingDeeper ? to : from) as { segments: string[] }).segments
  return {
    slug: segments[segments.length - 1],
    depth: Math.max(fromDepth, toDepth),
    direction: goingDeeper ? 'in' : 'out',
  }
}

function readLocation(): string {
  return window.location.pathname + window.location.hash
}

// Cached rather than read straight from window on every render. Opening a
// folder holds the page swap back until the grid has slid away, and on a
// back/forward navigation window.location has already moved by then — reading
// it live would swap the page instantly and there'd be nothing left to animate.
let currentLocation = typeof window === 'undefined' ? '/' : readLocation()

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getSnapshot(): string {
  return currentLocation
}

function commit(to: string, before?: () => void): void {
  runFolderTransition(pivotBetween(currentLocation, to), () => {
    before?.()
    currentLocation = to
    notify()
  })
}

export function navigate(to: string): void {
  if (to === currentLocation) return
  commit(to, () => {
    window.history.pushState(null, '', to)
    window.scrollTo(0, 0)
  })
}

// Like navigate, but leaving no history entry behind — for the OAuth return,
// whose URL carries a single-use code that must never be reachable with the
// back button.
export function replaceLocation(to: string): void {
  if (to === currentLocation) return
  commit(to, () => {
    window.history.replaceState(null, '', to)
    window.scrollTo(0, 0)
  })
}

// One listener for the whole app rather than one per subscriber, so back/forward
// navigation runs through the same transition path as an in-page link.
if (typeof window !== 'undefined') {
  const onLocationChange = () => {
    const next = readLocation()
    if (next !== currentLocation) commit(next)
  }
  window.addEventListener('popstate', onLocationChange)
  window.addEventListener('hashchange', onLocationChange)
}

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, getSnapshot, () => currentLocation))
}
