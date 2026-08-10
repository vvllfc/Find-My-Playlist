import { describe, expect, it } from 'vitest'
import { classifyPlaylistName, deriveTagsFromName } from './genreTaxonomy.js'
import taxonomy from '../../data/genre-taxonomy.json'

const classify = (name: string) => classifyPlaylistName(name, taxonomy)

describe('classifyPlaylistName', () => {
  it('puts every "Feel The …" playlist in the Feel folder, genre word as sub-folder', () => {
    expect(classify('Feel The Vibe Chill')).toEqual({
      category: 'Feel',
      subcategory: 'Rock',
      tags: ['Feel', 'Rock', 'chill'],
    })
    expect(classify('Feel The Rockvibe')).toMatchObject({ category: 'Feel', subcategory: 'Rock' })
    expect(classify('Feel The HardRock')).toMatchObject({ category: 'Feel', subcategory: 'HardRock' })
    expect(classify('Feel The Electro')).toMatchObject({ category: 'Feel', subcategory: 'Electro' })
    expect(classify('Feel The Punk')).toMatchObject({ category: 'Feel', subcategory: 'Punk' })
    expect(classify('Feel The Vibe Much Higher')).toMatchObject({
      category: 'Feel',
      tags: ['Feel', 'Rock', 'energetic+'],
    })
  })

  it('keeps nationality as a secondary tag, never the sub-folder', () => {
    expect(classify('Feel The Spanish Latino Chill')).toEqual({
      category: 'Feel',
      subcategory: 'Latino',
      tags: ['Feel', 'Latino', 'Spanish', 'chill'],
    })
    expect(classify('Feel The French Vibe Chill Like Before')).toEqual({
      category: 'Feel',
      subcategory: 'Rock',
      tags: ['Feel', 'Rock', 'French', 'chill', 'Like Before'],
    })
  })

  it('still files a Feel The… name with no recognized genre word under Feel (Autres)', () => {
    expect(classify('Feel The Happiness')).toEqual({ category: 'Feel', subcategory: null, tags: ['Feel'] })
    expect(classify('Feel The Happiness Like Before')).toMatchObject({
      category: 'Feel',
      subcategory: null,
      tags: ['Feel', 'Like Before'],
    })
    // Unknown nationality word, but a real genre word later in the name.
    expect(classify('Feel The Netherlands Vibe')).toMatchObject({ category: 'Feel', subcategory: 'Rock' })
  })

  it('derives category, sub-folder, era and voice for Techno playlists', () => {
    expect(classify('Techno Nappe AfterVNR Voice')).toEqual({
      category: 'Techno',
      subcategory: 'Nappe',
      tags: ['Techno', 'Nappe', 'AfterVNR', 'vocals'],
    })
    expect(classify('Techno Acide AfterVNR160+ Voice')).toMatchObject({
      subcategory: 'Acide',
      tags: ['Techno', 'Acide', 'AfterVNR160+', 'vocals'],
    })
    expect(classify('Techno Minimal After')).toMatchObject({ category: 'Techno', subcategory: 'Minimal' })
  })

  it('never reads "No Voice" as vocals, even alongside an earlier "Voice"', () => {
    expect(classify("Wallaby's Rave No Voice").tags).not.toContain('vocals')
    expect(classify("Wallaby's Journey No Voice Hard").tags).not.toContain('vocals')
    expect(classify("Wallaby's Rave Voice Melo Hard No Voice").tags).not.toContain('vocals')
    expect(classify("Wallaby's Rave Voice").tags).toContain('vocals')
    expect(classify('Techno Voice After').tags).toContain('vocals')
  })

  it('normalizes casing and either apostrophe character', () => {
    expect(classify("Wallaby's Deep Rave ChillFort")).toEqual({
      category: "Wallaby's",
      subcategory: 'Deep Rave',
      tags: ["Wallaby's", 'Deep Rave', 'chill+'],
    })
    expect(classify('Wallaby’s Rave Voice')).toMatchObject({ category: "Wallaby's" })
    expect(classify("WALLABY'S TRANCE")).toMatchObject({ subcategory: 'Trance' })
  })

  it('classifies the remaining declarative families', () => {
    expect(classify('D&B Nappe Chill Voice')).toMatchObject({ category: 'D&B', subcategory: 'Nappe' })
    expect(classify('Jazzy Summer ChillFort')).toMatchObject({ category: 'Jazzy Soul', subcategory: 'Summer' })
    expect(classify('Rap Game Old School Now')).toMatchObject({ category: 'Rap Game', subcategory: 'Old School' })
    expect(classify('Raggameff Dubbidub Much Higher')).toMatchObject({ category: 'Raggameff', subcategory: 'Dubbidub' })
    expect(classify('Reggaeton Chill')).toMatchObject({ category: 'Reggaeton' })
    expect(classify('Classique Opera')).toMatchObject({ category: 'Classique', subcategory: 'Opera' })
    expect(classify('Dubstep')).toMatchObject({ category: 'Dubstep' })
    expect(classify('Boiler Room Set')).toMatchObject({ category: 'Boiler' })
    expect(classify('Futur Set 2026')).toMatchObject({ category: 'Boiler' })
    expect(classify('You Must Feel This')).toMatchObject({ category: 'You Must Feel' })
  })

  it('returns no category for names matching no family', () => {
    expect(classify('Best Of 02/2026')).toEqual({ category: null, subcategory: null, tags: [] })
    expect(classify('Lost & Found')).toEqual({ category: null, subcategory: null, tags: [] })
  })
})

describe('deriveTagsFromName', () => {
  it('returns just the tags for tag-suggestion callers', () => {
    expect(deriveTagsFromName('Feel The Vibe Chill', taxonomy)).toEqual(['Feel', 'Rock', 'chill'])
    expect(deriveTagsFromName('Lost & Found', taxonomy)).toEqual([])
  })
})
