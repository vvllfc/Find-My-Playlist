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

  it('routes the glossary as its own page, not as a catalog segment', () => {
    expect(parseRoute('/glossaire')).toEqual({ kind: 'glossary' })
    expect(parseRoute('/glossaire/')).toEqual({ kind: 'glossary' })
    // Only the bare path — anything deeper is not the glossary.
    expect(parseRoute('/glossaire/techno')).toEqual({ kind: 'catalog', segments: ['glossaire', 'techno'] })
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

describe('the OAuth landing path', () => {
  it('routes /connexion as its own page rather than a catalog segment', () => {
    expect(parseRoute('/connexion')).toEqual({ kind: 'authCallback' })
    expect(parseRoute('/connexion/')).toEqual({ kind: 'authCallback' })
    // Google comes back with ?code= on the end, and parseRoute never sees it:
    // readLocation is pathname + hash, and a query lives in neither. Feeding
    // one in here would fail, which is why the callback is recognised by
    // window.location.pathname in App.tsx rather than through a route.
    // Only the bare path, like the glossary — anything deeper is not it.
    expect(parseRoute('/connexion/oops')).toEqual({ kind: 'catalog', segments: ['connexion', 'oops'] })
  })

  it('leaves the callback out of the folder animation', () => {
    // Not a step up or down the hierarchy, so there is no tile to pivot around
    // and nothing should try to animate on the way back out of the login.
    expect(pivotBetween('/', '/connexion')).toBeNull()
    expect(pivotBetween('/connexion', '/genre/techno')).toBeNull()
  })
})

describe('the favourites page', () => {
  it('routes /favoris as its own page rather than a catalog segment', () => {
    expect(parseRoute('/favoris')).toEqual({ kind: 'favorites' })
    expect(parseRoute('/favoris/')).toEqual({ kind: 'favorites' })
    // Only the bare path, like the glossary — anything deeper is not it, and
    // without this it would silently render the catalogue instead of a 404.
    expect(parseRoute('/favoris/techno')).toEqual({ kind: 'catalog', segments: ['favoris', 'techno'] })
  })

  it('leaves the shelf out of the folder animation', () => {
    // It lists across every folder, so there is no tile for the grid to pivot
    // around on the way in or out.
    expect(pivotBetween('/', '/favoris')).toBeNull()
    expect(pivotBetween('/genre/techno', '/favoris')).toBeNull()
  })
})

describe('the account page', () => {
  it('routes /compte as its own page rather than a catalog segment', () => {
    expect(parseRoute('/compte')).toEqual({ kind: 'account' })
    expect(parseRoute('/compte/')).toEqual({ kind: 'account' })
    expect(parseRoute('/compte/reglages')).toEqual({ kind: 'catalog', segments: ['compte', 'reglages'] })
  })
})
