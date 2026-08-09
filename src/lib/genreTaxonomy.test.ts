import { describe, expect, it } from 'vitest'
import { deriveTagsFromName } from './genreTaxonomy.js'
import taxonomy from '../../data/genre-taxonomy.json'

describe('deriveTagsFromName', () => {
  it('derives Rock + tempo for the Feel The Vibe family', () => {
    expect(deriveTagsFromName('Feel The Vibe Chill', taxonomy)).toEqual(['Rock', 'chill'])
    expect(deriveTagsFromName('Feel The Vibe ChillFort', taxonomy)).toEqual(['Rock', 'chill+'])
    expect(deriveTagsFromName('Feel The Vibe Higher', taxonomy)).toEqual(['Rock', 'energetic'])
    expect(deriveTagsFromName('Feel The Vibe Much Higher', taxonomy)).toEqual(['Rock', 'energetic+'])
  })

  it('derives a genre from the remainder for other Feel The X playlists', () => {
    expect(deriveTagsFromName('Feel The HardRock', taxonomy)).toEqual(['HardRock'])
    expect(deriveTagsFromName('Feel The Punk', taxonomy)).toEqual(['Punk'])
  })

  it('derives subgenre, era and voice flag for Techno playlists', () => {
    expect(deriveTagsFromName('Techno Nappe AfterVNR Voice', taxonomy)).toEqual([
      'Techno',
      'Nappe',
      'AfterVNR',
      'vocals',
    ])
    expect(deriveTagsFromName('Techno Minimal After', taxonomy)).toEqual(['Techno', 'Minimal', 'After'])
    expect(deriveTagsFromName('Techno Acide AfterVNR160+ Voice', taxonomy)).toEqual([
      'Techno',
      'Acide',
      'AfterVNR160+',
      'vocals',
    ])
  })

  it('returns no tags for names that match no known family', () => {
    expect(deriveTagsFromName('D&B Voice', taxonomy)).toEqual([])
    expect(deriveTagsFromName('Rap Game FR Old School Now Zepo', taxonomy)).toEqual([])
  })
})
