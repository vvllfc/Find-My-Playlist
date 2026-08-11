// Opening a folder pushes the rest of the grid aside: the cover you clicked
// holds still while every other tile slides out past the edge it's nearest,
// then the destination arrives.
//
// Animated on the real tiles with the Web Animations API rather than through
// View Transitions. Two reasons: the parallax needs a *different* direction
// per tile, and view-transition pseudo-elements inherit from the root rather
// than from the tile they came from, so per-tile styling would mean generating
// one CSS rule per tile. Animating the live DOM also keeps the artwork at its
// natural resolution — the previous zoom blew a ~240px snapshot up fivefold,
// which is what made it look pixelated.

export interface FolderPivot {
  slug: string
  depth: number
  /** 'in' when opening a folder, 'out' when coming back up. */
  direction: 'in' | 'out'
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export const PUSH_OUT_MS = 420
export const PULL_IN_MS = 360
const ANCHOR_SCALE = 1.06

/**
 * How far a tile travels so it clears the screen, pushed directly away from
 * the tile being opened. Distant tiles are carried further than near ones,
 * which is what gives the movement its depth.
 *
 * Returns null for the anchor itself — it stays put.
 */
export function pushVector(anchor: Rect, tile: Rect, viewport: Viewport): { x: number; y: number } | null {
  const dx = tile.left + tile.width / 2 - (anchor.left + anchor.width / 2)
  const dy = tile.top + tile.height / 2 - (anchor.top + anchor.height / 2)

  const distance = Math.hypot(dx, dy)
  if (distance === 0) return null

  // The diagonal alone already carries any tile off screen, whatever corner it
  // started in. The boost on top is what gives the movement depth: tiles
  // further from the one you picked are thrown harder, so the grid opens up
  // instead of sliding away as one flat sheet.
  const reach = Math.hypot(viewport.width, viewport.height)
  const travel = reach * (1 + Math.min(distance / reach, 1) * 0.6)
  return { x: (dx / distance) * travel, y: (dy / distance) * travel }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function canAnimate(): boolean {
  if (typeof document === 'undefined') return false
  if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return false
  return !prefersReducedMotion()
}

function findTiles(pivot: FolderPivot): { anchor: HTMLElement; others: HTMLElement[] } | null {
  const tiles = [...document.querySelectorAll<HTMLElement>('.folder-tile')]
  if (tiles.length === 0) return null

  // Matched on depth as well as slug: a folder can contain a sub-folder that
  // repeats its own name (Boiler does), and the two live at different levels.
  const anchor = tiles.find(
    (tile) =>
      tile.dataset.folderSlug === pivot.slug && tile.dataset.folderDepth === String(pivot.depth),
  )
  if (!anchor) return null

  return { anchor, others: tiles.filter((tile) => tile !== anchor) }
}

function viewportSize(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight }
}

/** Sends every tile but the anchor off screen. Resolves when they're gone. */
function pushAside(pivot: FolderPivot): Promise<void> | null {
  const found = findTiles(pivot)
  if (!found) return null

  const viewport = viewportSize()
  const anchorRect = found.anchor.getBoundingClientRect()

  const animations = found.others.flatMap((tile) => {
    const vector = pushVector(anchorRect, tile.getBoundingClientRect(), viewport)
    if (!vector) return []
    return tile.animate(
      [
        { transform: 'translate(0, 0)', opacity: 1 },
        { transform: `translate(${vector.x}px, ${vector.y}px)`, opacity: 0 },
      ],
      { duration: PUSH_OUT_MS, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
    )
  })

  // The one you picked leans forward a touch — enough to read as chosen,
  // small enough that the artwork never leaves its native resolution.
  found.anchor.animate([{ transform: 'scale(1)' }, { transform: `scale(${ANCHOR_SCALE})` }], {
    duration: PUSH_OUT_MS,
    easing: 'ease-out',
    fill: 'forwards',
  })

  return Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(() => {})
}

/** Brings the grid back in from off screen, once it has re-rendered. */
function pullIn(pivot: FolderPivot): void {
  const found = findTiles(pivot)
  if (!found) return

  const viewport = viewportSize()
  const anchorRect = found.anchor.getBoundingClientRect()

  for (const tile of found.others) {
    const vector = pushVector(anchorRect, tile.getBoundingClientRect(), viewport)
    if (!vector) continue
    tile.animate(
      [
        { transform: `translate(${vector.x}px, ${vector.y}px)`, opacity: 0 },
        { transform: 'translate(0, 0)', opacity: 1 },
      ],
      { duration: PULL_IN_MS, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
    )
  }

  found.anchor.animate([{ transform: `scale(${ANCHOR_SCALE})` }, { transform: 'scale(1)' }], {
    duration: PULL_IN_MS,
    easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  })
}

let running = false

/**
 * Applies `update` — always exactly once — around the folder animation.
 * Going in, the grid clears first and the page changes after; coming back, the
 * page changes first and the grid settles in behind it.
 */
export function runFolderTransition(pivot: FolderPivot | null, update: () => void): void {
  if (!pivot || running || !canAnimate()) {
    update()
    return
  }

  if (pivot.direction === 'out') {
    update()
    // The destination grid only exists after React has rendered it.
    requestAnimationFrame(() => pullIn(pivot))
    return
  }

  const pushed = pushAside(pivot)
  if (!pushed) {
    update()
    return
  }

  running = true
  pushed
    .catch(() => {})
    .finally(() => {
      running = false
      update()
    })
}
