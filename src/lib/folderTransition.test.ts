import { afterEach, describe, expect, it, vi } from 'vitest'
import { pushVector, runFolderTransition } from './folderTransition'

const VIEWPORT = { width: 1200, height: 800 }
const anchor = { left: 500, top: 300, width: 200, height: 200 }
const tile = (left: number, top: number) => ({ left, top, width: 200, height: 200 })

describe('pushVector', () => {
  it('sends each tile away from the anchor, on the side it already sits', () => {
    const left = pushVector(anchor, tile(100, 300), VIEWPORT)!
    expect(left.x).toBeLessThan(0)
    expect(Math.abs(left.y)).toBeLessThan(1)

    const right = pushVector(anchor, tile(900, 300), VIEWPORT)!
    expect(right.x).toBeGreaterThan(0)

    const above = pushVector(anchor, tile(500, 50), VIEWPORT)!
    expect(above.y).toBeLessThan(0)

    const below = pushVector(anchor, tile(500, 600), VIEWPORT)!
    expect(below.y).toBeGreaterThan(0)
  })

  it('carries every tile far enough to clear the screen', () => {
    const diagonal = Math.hypot(VIEWPORT.width, VIEWPORT.height)
    for (const candidate of [tile(100, 300), tile(900, 700), tile(520, 280)]) {
      const vector = pushVector(anchor, candidate, VIEWPORT)!
      expect(Math.hypot(vector.x, vector.y)).toBeGreaterThanOrEqual(diagonal)
    }
  })

  it('throws distant tiles harder than near ones, which is what gives it depth', () => {
    const near = pushVector(anchor, tile(720, 300), VIEWPORT)!
    const far = pushVector(anchor, tile(1150, 300), VIEWPORT)!
    expect(Math.hypot(far.x, far.y)).toBeGreaterThan(Math.hypot(near.x, near.y))
  })

  it('leaves the anchor itself alone', () => {
    expect(pushVector(anchor, { ...anchor }, VIEWPORT)).toBeNull()
  })

  it('pushes diagonally for a tile offset on both axes', () => {
    const vector = pushVector(anchor, tile(900, 700), VIEWPORT)!
    expect(vector.x).toBeGreaterThan(0)
    expect(vector.y).toBeGreaterThan(0)
  })
})

describe('runFolderTransition', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubEnvironment({ reduceMotion, hasTiles }: { reduceMotion: boolean; hasTiles: boolean }) {
    vi.stubGlobal('document', { querySelectorAll: () => (hasTiles ? [{}] : []) })
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({ matches: reduceMotion && query.includes('reduce') }),
    })
    vi.stubGlobal('Element', { prototype: { animate: () => ({ finished: Promise.resolve() }) } })
  }

  it('navigates straight away when the visitor asked for reduced motion', () => {
    stubEnvironment({ reduceMotion: true, hasTiles: true })
    const update = vi.fn()

    runFolderTransition({ slug: 'feel', depth: 1, direction: 'in' }, update)

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('navigates straight away for a move with no anchor tile', () => {
    stubEnvironment({ reduceMotion: false, hasTiles: true })
    const update = vi.fn()

    runFolderTransition(null, update)

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('still navigates when the anchor tile cannot be found in the page', () => {
    // e.g. arriving straight on a deep link, where no grid was ever rendered.
    stubEnvironment({ reduceMotion: false, hasTiles: false })
    const update = vi.fn()

    runFolderTransition({ slug: 'feel', depth: 1, direction: 'in' }, update)

    expect(update).toHaveBeenCalledTimes(1)
  })
})
