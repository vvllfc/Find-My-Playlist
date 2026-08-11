import { describe, expect, it } from 'vitest'
import { parseRoute } from './router'

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
