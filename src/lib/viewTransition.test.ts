import { afterEach, describe, expect, it, vi } from 'vitest'
import { isZoomPivot, runWithZoom } from './viewTransition'

// Tests run in Node (no jsdom dependency, like the rest of the suite).
// runWithZoom only ever touches document.startViewTransition and
// window.matchMedia, and reads both at call time, so stubbing those two is
// enough to exercise every branch.
function setEnvironment({ supported, reduceMotion }: { supported: boolean; reduceMotion: boolean }) {
  const start = vi.fn((callback: () => void) => {
    callback()
    return { finished: Promise.resolve() }
  })
  vi.stubGlobal('document', {
    startViewTransition: supported ? start : undefined,
    // No cover to measure: aiming the zoom bails out early, which is also the
    // real behaviour on a navigation whose cover isn't on screen.
    querySelector: () => null,
    documentElement: { style: { setProperty() {} } },
  })
  vi.stubGlobal('window', {
    innerWidth: 1200,
    innerHeight: 800,
    matchMedia: (query: string) => ({ matches: reduceMotion && query.includes('reduce') }),
  })
  return start
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runWithZoom', () => {
  it('applies the update directly when the browser has no View Transitions', () => {
    setEnvironment({ supported: false, reduceMotion: false })
    const update = vi.fn()

    runWithZoom({ slug: 'feel', depth: 1 }, update)

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('skips the animation when the visitor asked for reduced motion', () => {
    const start = setEnvironment({ supported: true, reduceMotion: true })
    const update = vi.fn()

    runWithZoom({ slug: 'feel', depth: 1 }, update)

    expect(update).toHaveBeenCalledTimes(1)
    expect(start).not.toHaveBeenCalled()
  })

  it('skips the animation for navigations with no folder to zoom through', () => {
    const start = setEnvironment({ supported: true, reduceMotion: false })
    const update = vi.fn()

    runWithZoom(null, update)

    expect(update).toHaveBeenCalledTimes(1)
    expect(start).not.toHaveBeenCalled()
  })

  it('runs the update inside the transition, exactly once, when supported', () => {
    const start = setEnvironment({ supported: true, reduceMotion: false })
    const update = vi.fn()

    runWithZoom({ slug: 'feel', depth: 1 }, update)

    expect(start).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
  })
})

describe('isZoomPivot', () => {
  it('matches only the folder at the matching depth', () => {
    const pivot = { slug: 'boiler', depth: 1 }
    expect(isZoomPivot(pivot, 'boiler', 1)).toBe(true)
    // Boiler contains a sub-folder repeating its slug: naming both covers would
    // make the browser morph between them instead of zooming through.
    expect(isZoomPivot(pivot, 'boiler', 2)).toBe(false)
    expect(isZoomPivot(pivot, 'techno', 1)).toBe(false)
    expect(isZoomPivot(null, 'boiler', 1)).toBe(false)
  })
})
