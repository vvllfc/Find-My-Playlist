import { describe, expect, it } from 'vitest'
import { parseRoute, pivotBetween } from './router'

describe('parseRoute', () => {
  it('routes public pages from the pathname, with no hash involved', () => {
    expect(parseRoute('/')).toEqual({ kind: 'catalog', segments: [] })
    expect(parseRoute('/genre/techno')).toEqual({ kind: 'catalog', segments: ['genre', 'techno'] })
    expect(parseRoute('/genre/feel/rock')).toEqual({ kind: 'catalog', segments: ['genre', 'feel', 'rock'] })
    expect(parseRoute('/genre/techno/')).toEqual({ kind: 'catalog', segments: ['genre', 'techno'] })
  })

  it('keeps the private pages on hash routes', () => {
    expect(parseRoute('/#/admin')).toEqual({ kind: 'admin' })
    expect(parseRoute('/#/modify')).toEqual({ kind: 'modify' })
    // Reachable from any path, including the OAuth redirect landing on "/".
    expect(parseRoute('/genre/techno#/modify')).toEqual({ kind: 'modify' })
  })

  it('treats an unknown hash as a public route rather than a private one', () => {
    expect(parseRoute('/#/whatever')).toEqual({ kind: 'catalog', segments: [] })
  })
})

describe('pivotBetween', () => {
  it('picks the folder being entered when going deeper', () => {
    expect(pivotBetween('/', '/genre/feel')).toEqual({ slug: 'feel', depth: 1, direction: 'in' })
    expect(pivotBetween('/genre/feel', '/genre/feel/rock')).toEqual({
      slug: 'rock',
      depth: 2,
      direction: 'in',
    })
  })

  it('picks the folder being left when coming back up, and reverses the effect', () => {
    expect(pivotBetween('/genre/feel', '/')).toEqual({ slug: 'feel', depth: 1, direction: 'out' })
    expect(pivotBetween('/genre/feel/rock', '/genre/feel')).toEqual({
      slug: 'rock',
      depth: 2,
      direction: 'out',
    })
  })

  it('has no pivot when the move is not a single step through the hierarchy', () => {
    // Two levels at once — no single cover to travel through.
    expect(pivotBetween('/genre/feel/rock', '/')).toBeNull()
    expect(pivotBetween('/', '/')).toBeNull()
    expect(pivotBetween('/genre/feel', '/genre/techno')).toBeNull()
  })

  it('has no pivot for the private pages', () => {
    expect(pivotBetween('/', '/#/admin')).toBeNull()
    expect(pivotBetween('/#/modify', '/')).toBeNull()
  })
})
