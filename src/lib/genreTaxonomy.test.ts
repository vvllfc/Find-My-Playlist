import { describe, expect, it } from 'vitest'
import { deriveTagsFromName } from './genreTaxonomy.js'
import taxonomy from '../../data/genre-taxonomy.json'

describe('deriveTagsFromName', () => {
  it('derives Rock + tempo for the Feel The Vibe/Rockvibe family', () => {
    expect(deriveTagsFromName('Feel The Vibe Chill', taxonomy)).toEqual(['Rock', 'chill'])
    expect(deriveTagsFromName('Feel The Vibe ChillFort', taxonomy)).toEqual(['Rock', 'chill+'])
    expect(deriveTagsFromName('Feel The Vibe Higher', taxonomy)).toEqual(['Rock', 'energetic'])
    expect(deriveTagsFromName('Feel The Vibe Much Higher', taxonomy)).toEqual(['Rock', 'energetic+'])
    expect(deriveTagsFromName('Feel The Rockvibe', taxonomy)).toEqual(['Rock'])
  })

  it('derives a genre from a known genre word for other Feel The X playlists', () => {
    expect(deriveTagsFromName('Feel The HardRock', taxonomy)).toEqual(['HardRock'])
    expect(deriveTagsFromName('Feel The Punk', taxonomy)).toEqual(['Punk'])
    expect(deriveTagsFromName('Feel The Metal', taxonomy)).toEqual(['Metal'])
    expect(deriveTagsFromName('Feel The Disco', taxonomy)).toEqual(['Disco'])
    expect(deriveTagsFromName('Feel The Electro', taxonomy)).toEqual(['Electro'])
    expect(deriveTagsFromName('Feel The Piano', taxonomy)).toEqual(['Piano'])
    expect(deriveTagsFromName('Feel The Country', taxonomy)).toEqual(['Country'])
  })

  it('keeps nationality as a secondary tag, never the category, for Feel The X', () => {
    expect(deriveTagsFromName('Feel The Spanish Vibe', taxonomy)).toEqual(['Rock', 'Spanish'])
    expect(deriveTagsFromName('Feel The French Vibe Chill', taxonomy)).toEqual(['Rock', 'French', 'chill'])
  })

  it('returns no tags when Feel The X has no recognized genre word (unrecognized nationality or bare name)', () => {
    expect(deriveTagsFromName('Feel The Happiness', taxonomy)).toEqual([])
    expect(deriveTagsFromName('Feel The Netherlands Vibe', taxonomy)).toEqual([])
    expect(deriveTagsFromName('Feel Linkin Park', taxonomy)).toEqual([])
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

  it('treats "No Voice" as an explicit negation, not a vocals match', () => {
    expect(deriveTagsFromName("Wallaby's Rave No Voice", taxonomy)).toEqual(['Wallaby\'s', 'Rave'])
    expect(deriveTagsFromName("Wallaby's Journey No Voice Hard", taxonomy)).toEqual([
      "Wallaby's",
      'energetic',
      'Journey',
    ])
  })

  it('normalizes casing and either apostrophe character for Wallaby\'s playlists', () => {
    expect(deriveTagsFromName("Wallaby's Deep Rave ChillFort", taxonomy)).toEqual([
      "Wallaby's",
      'chill+',
      'Deep Rave',
    ])
    expect(deriveTagsFromName('Wallaby’s Rave Voice', taxonomy)).toEqual(["Wallaby's", 'Rave', 'vocals'])
    expect(deriveTagsFromName("WALLABY'S TRANCE", taxonomy)).toEqual(["Wallaby's", 'Trance'])
  })

  it('derives tags for D&B, Jazzy Soul, Raggameff and Rap Game', () => {
    expect(deriveTagsFromName('D&B Nappe Chill Voice', taxonomy)).toEqual(['D&B', 'chill', 'Nappe', 'vocals'])
    expect(deriveTagsFromName('Jazzy Summer ChillFort', taxonomy)).toEqual(['Jazzy Soul', 'chill+', 'Summer'])
    expect(deriveTagsFromName('Raggameff Dubbidub Much Higher Voice', taxonomy)).toEqual([
      'Raggameff',
      'energetic+',
      'Dubbidub',
      'vocals',
    ])
    expect(deriveTagsFromName('Rap Game Old School Now', taxonomy)).toEqual(['Rap Game', 'Old School', 'Now'])
  })

  it('derives a single genre tag for the simple prefix families', () => {
    expect(deriveTagsFromName('Reggaeton Chill', taxonomy)).toEqual(['Reggaeton', 'chill'])
    expect(deriveTagsFromName('Ska ChillFort', taxonomy)).toEqual(['Ska', 'chill+'])
    expect(deriveTagsFromName('Classique Opera', taxonomy)).toEqual(['Classique', 'Opera'])
    expect(deriveTagsFromName('Over The Clouds Chill', taxonomy)).toEqual(['Over The Clouds', 'chill'])
    expect(deriveTagsFromName('Over The Sky Higher Voice', taxonomy)).toEqual([
      'Over The Sky',
      'energetic',
      'vocals',
    ])
  })

  it('folds Futur Set into the Boiler category alongside Boiler-prefixed playlists', () => {
    expect(deriveTagsFromName('Boiler Room Set', taxonomy)).toEqual(['Boiler'])
    expect(deriveTagsFromName('Futur Set 2026', taxonomy)).toEqual(['Boiler'])
  })

  it('derives You Must Feel as its own standalone category', () => {
    expect(deriveTagsFromName('You Must Feel This', taxonomy)).toEqual(['You Must Feel'])
  })

  it('returns no tags for names that match no known family', () => {
    expect(deriveTagsFromName('Best Of 02/2026', taxonomy)).toEqual([])
    expect(deriveTagsFromName('Lost & Found', taxonomy)).toEqual([])
    expect(deriveTagsFromName('A ajouter à futur set', taxonomy)).toEqual([])
  })
})