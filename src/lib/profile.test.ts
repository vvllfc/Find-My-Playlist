import { describe, expect, it } from 'vitest'
import { canGoPublic, confirmsDeletion, DISPLAY_NAME_MAX, normalizeDisplayName } from './profile'

describe('normalizeDisplayName', () => {
  it('trims, because the database counts a trimmed name', () => {
    // The CHECK constraint measures char_length(btrim(...)), so a name of pure
    // spaces would be rejected by the server rather than stored as blank.
    expect(normalizeDisplayName('  Valentin  ')).toBe('Valentin')
    expect(normalizeDisplayName('   ')).toBe('')
  })

  it('cuts to the length the table will accept', () => {
    const long = 'a'.repeat(DISPLAY_NAME_MAX + 20)
    expect(normalizeDisplayName(long)).toHaveLength(DISPLAY_NAME_MAX)
  })
})

describe('canGoPublic', () => {
  it('refuses to publish votes with no name to publish', () => {
    // The view drops profiles without a name anyway; refusing here is what
    // lets the page say why instead of saving a setting that does nothing.
    expect(canGoPublic('')).toBe(false)
    expect(canGoPublic('   ')).toBe(false)
    expect(canGoPublic('Valentin')).toBe(true)
  })
})

describe('confirmsDeletion', () => {
  it('releases only on the word itself', () => {
    expect(confirmsDeletion('SUPPRIMER')).toBe(true)
    // Forgiving about case and space, because the safeguard is having typed
    // nine letters on purpose — not the shift key.
    expect(confirmsDeletion('  supprimer ')).toBe(true)
    expect(confirmsDeletion('')).toBe(false)
    expect(confirmsDeletion('suppr')).toBe(false)
    expect(confirmsDeletion('SUPPRIMER MON COMPTE')).toBe(false)
  })
})

describe('normalizeDisplayName and the unique index', () => {
  it('collapses inner runs of space, as the index does', () => {
    // The index compares lower(regexp_replace(btrim(name), '\s+', ' ', 'g')).
    // If the client saved a double space, the row would be stored one way and
    // matched another, and the server would refuse a name the page had just
    // shown as free.
    expect(normalizeDisplayName('Val   entin')).toBe('Val entin')
    expect(normalizeDisplayName('  Val\t\ventin  ')).toBe('Val entin')
  })

  it('leaves the letter s alone', () => {
    // Guards a real slip: written \s+ without the backslash, this replaced
    // every literal "s" instead of every space.
    expect(normalizeDisplayName('Basse Sensation')).toBe('Basse Sensation')
  })
})
