import { useSyncExternalStore } from 'react'

function getHash(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

export function useHashRoute(): string {
  return useSyncExternalStore(subscribe, getHash)
}
