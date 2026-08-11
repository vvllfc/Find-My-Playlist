import { useSyncExternalStore } from 'react'

// Public pages use real paths (/genre/techno) so shared links stay clean.
// The two private pages deliberately stay on hash routes — they're never part
// of the site's path structure, and a hash is never sent to the server.
//
// GitHub Pages has no SPA rewrite setting, so the build ships dist/404.html as
// a copy of index.html (see vite.config.ts): a cold deep link to /genre/techno
// is served that copy and boots the app, which then routes on the pathname.

const listeners = new Set<() => void>()

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  window.addEventListener('popstate', callback)
  window.addEventListener('hashchange', callback)
  return () => {
    listeners.delete(callback)
    window.removeEventListener('popstate', callback)
    window.removeEventListener('hashchange', callback)
  }
}

function snapshot(): string {
  return window.location.pathname + window.location.hash
}

// pushState alone doesn't notify anything, so nudge subscribers by hand.
export function navigate(to: string): void {
  if (to === snapshot()) return
  window.history.pushState(null, '', to)
  for (const listener of listeners) listener()
}

export type Route =
  | { kind: 'admin' }
  | { kind: 'modify' }
  | { kind: 'catalog'; segments: string[] }

export function parseRoute(location: string): Route {
  const hashIndex = location.indexOf('#')
  const pathname = hashIndex === -1 ? location : location.slice(0, hashIndex)
  const hash = hashIndex === -1 ? '' : location.slice(hashIndex + 1)

  if (hash.startsWith('/admin')) return { kind: 'admin' }
  if (hash.startsWith('/modify')) return { kind: 'modify' }
  return { kind: 'catalog', segments: pathname.split('/').filter(Boolean) }
}

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, snapshot))
}
