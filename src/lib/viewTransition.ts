import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

// Drives the "walk into the artwork" transition between folder levels.
// Deliberately knows nothing about routing: the router decides which folder is
// the pivot of a navigation, this module only owns the pivot state and the
// browser View Transitions plumbing.
//
// One cover at a time carries `view-transition-name: folder-zoom`, so the
// browser lifts it out of the page snapshot and animates it on its own while
// the rest cross-fades. Which side of the navigation holds it is what makes
// the effect read as forward or backward:
//   forward  — the old page has the cover, nothing matches it in the new page,
//              so it scales up past the viewer and fades (::view-transition-old)
//   backward — only the new page has it, so the same keyframes played in
//              reverse settle it back into the grid (::view-transition-new)

export const FOLDER_ZOOM_NAME = 'folder-zoom'

/**
 * The folder a navigation pivots around. `depth` matters as much as `slug`:
 * a sub-folder can repeat its parent's slug (Boiler contains a Boiler
 * sub-folder), and naming both covers at once would make the browser morph
 * between them instead of zooming through.
 */
export interface ZoomPivot {
  slug: string
  depth: number
  /** 'in' when opening a folder, 'out' when coming back up. */
  direction: 'in' | 'out'
}

let pivot: ZoomPivot | null = null
const listeners = new Set<() => void>()

function setPivot(next: ZoomPivot | null): void {
  pivot = next
  for (const listener of listeners) listener()
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getPivot(): ZoomPivot | null {
  return pivot
}

export function useZoomPivot(): ZoomPivot | null {
  return useSyncExternalStore(subscribe, getPivot, () => null)
}

/** True when this element should carry the zoom name for the current transition. */
export function isZoomPivot(current: ZoomPivot | null, slug: string, depth: number): boolean {
  return current !== null && current.slug === slug && current.depth === depth
}

// Typed as always present by the DOM lib, but absent in browsers that predate
// the API — hence the runtime check rather than a type guard.
function canAnimate(): boolean {
  if (typeof document === 'undefined') return false
  if (typeof document.startViewTransition !== 'function') return false
  // Honoured in JS as well as CSS: without this the DOM swap would still be
  // deferred behind a transition the visitor asked not to see.
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// A little past edge-to-edge, so no sliver of the page shows around the cover
// at full size.
const COVER_OVERSHOOT = 1.15

/**
 * Aims the zoom at the viewer and sizes it to swallow the screen — the two
 * things that make it read as stepping into the artwork rather than as a tile
 * inflating in place. Scaling alone would swell an off-centre tile off the
 * nearest edge, and a fixed scale would fall short: a tile is a very different
 * size across two phone columns and four desktop ones. Published as CSS
 * variables that the keyframes in index.css read.
 */
function aimZoomAtViewport(): void {
  const cover = document.querySelector<HTMLElement>(`[style*="view-transition-name"]`)
  if (!cover) return

  // Includes the hover transform, so the zoom continues from exactly the state
  // on screen instead of jumping back to the resting size first.
  const box = cover.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return

  const dx = window.innerWidth / 2 - (box.left + box.width / 2)
  const dy = window.innerHeight / 2 - (box.top + box.height / 2)
  const scale = Math.max(window.innerWidth / box.width, window.innerHeight / box.height) * COVER_OVERSHOOT

  const style = document.documentElement.style
  style.setProperty('--zoom-dx', `${Math.round(dx)}px`)
  style.setProperty('--zoom-dy', `${Math.round(dy)}px`)
  style.setProperty('--zoom-scale', scale.toFixed(2))
}

let running = false

/**
 * Applies `update` — always exactly once — wrapped in a view transition when
 * the browser and the visitor's motion preference allow one.
 */
export function runWithZoom(next: ZoomPivot | null, update: () => void): void {
  if (!next || running || !canAnimate()) {
    update()
    return
  }

  // Naming the cover has to happen in its own synchronous render: the browser
  // captures the outgoing page the moment startViewTransition is called, so
  // the name must already be on the element by then.
  flushSync(() => setPivot(next))
  // Going deeper, the cover lives in the page we're leaving, so it can be
  // measured now.
  aimZoomAtViewport()
  // Lets the stylesheet time each direction on its own: arriving wants dwell,
  // retreating wants to get out of the way.
  document.documentElement.dataset.zoomDirection = next.direction

  running = true
  const transition = document.startViewTransition(() => {
    flushSync(update)
    // Coming back up, it only exists once the destination has rendered.
    aimZoomAtViewport()
  })

  // `finished` rejects when a transition is skipped (a second navigation, a
  // backgrounded tab); the pivot must be released either way or the cover
  // would stay named and poison the next transition.
  transition.finished
    .catch(() => {})
    .finally(() => {
      running = false
      delete document.documentElement.dataset.zoomDirection
      setPivot(null)
    })
}
