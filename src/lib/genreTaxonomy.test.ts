import { describe, expect, it } from 'vitest'
import { classifyPlaylistName, deriveTagsFromName } from './genreTaxonomy.js'
import taxonomy from '../../data/genre-taxonomy.json'

const classify = (name: string) => classifyPlaylistName(name, taxonomy)

describe('classifyPlaylistName', () => {
  it('splits the Vibe family by language, one sub-folder each', () => {
    expect(classify('Feel The FrenchVibe Chill')).toEqual({
      category: 'Vibes',
      subcategory: 'French Vibe',
      // Tagged with the bare language, not the sub-folder's name: "French" and
      // "French Vibe" would be two chips saying one thing.
      tags: ['Vibes', 'French', 'chill'],
    })
    expect(classify('Feel The RussianVibe')).toMatchObject({ subcategory: 'Russian Vibe' })
    expect(classify('Feel The Netherlands Vibe')).toMatchObject({ subcategory: 'Netherlands Vibe' })
    // Spelled apart, and with Rock in the middle — same language, same folder.
    expect(classify('Feel The Spanish Rockvibe')).toMatchObject({ subcategory: 'Spanish Vibe' })
    expect(classify('Feel The Italian Vibe Chill')).toMatchObject({ subcategory: 'Italian Vibe' })
  })

  it('files a Vibe with no language named as English, Electro and Piano included', () => {
    expect(classify('Feel The Vibe Chill')).toEqual({
      category: 'Vibes',
      subcategory: 'English Vibe',
      tags: ['Vibes', 'English', 'chill'],
    })
    expect(classify('Feel The ElectroVibe Higher')).toMatchObject({ subcategory: 'English Vibe' })
    expect(classify('Feel The PianoVibe Chill')).toMatchObject({ subcategory: 'English Vibe' })
  })

  it('tags Rock on the playlists actually named RockVibe, and only those', () => {
    expect(classify('Feel The RockVibe Much Higher').tags).toEqual([
      'Vibes',
      'English',
      'Rock',
      'energetic+',
    ])
    expect(classify('Feel The Spanish Rockvibe Chill').tags).toEqual(['Vibes', 'Spanish', 'Rock', 'chill'])
    // A bare "Vibe" makes no claim to being rock.
    expect(classify('Feel The Vibe Chill').tags).not.toContain('Rock')
    expect(classify('Feel The FrenchVibe').tags).not.toContain('Rock')
  })

  it('gives the promoted genres a folder of their own, language as a tag', () => {
    // Named "Feel The …" like the rest, but they stand alone rather than
    // nesting inside Vibes.
    expect(classify('Feel The Punk')).toEqual({ category: 'Punk', subcategory: null, tags: ['Punk'] })
    expect(classify('Feel The French Punk Chill')).toEqual({
      category: 'Punk',
      subcategory: null,
      tags: ['Punk', 'French', 'chill'],
    })
    expect(classify('Feel The German Metal')).toMatchObject({ category: 'Metal', tags: ['Metal', 'German'] })
    expect(classify('Feel The Disco Now')).toMatchObject({ category: 'Disco' })
    expect(classify('Feel The HardRock')).toMatchObject({ category: 'Hard Rock' })
    expect(classify('Feel The Country')).toMatchObject({ category: 'Country' })
  })

  it('keeps the genres that were not promoted inside Vibes', () => {
    expect(classify('Feel The Spanish Latino Chill')).toEqual({
      category: 'Vibes',
      subcategory: 'Latino',
      tags: ['Vibes', 'Latino', 'Spanish', 'chill'],
    })
  })

  it('still files a Feel The… name with no recognized genre word under Vibes (Autres)', () => {
    expect(classify('Feel The Happiness')).toEqual({ category: 'Vibes', subcategory: null, tags: ['Vibes'] })
    expect(classify('Feel The Happiness Like Before')).toMatchObject({
      category: 'Vibes',
      subcategory: null,
      tags: ['Vibes', 'Like Before'],
    })
    // A language with no genre word after it is still not a Vibe.
    expect(classify('Feel The French Old School')).toMatchObject({ category: 'Vibes', subcategory: null })
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
    // Like Classique: too few playlists for chips to earn their place, so the
    // genre is all that's derived — not the sub-genre, tempo or voice marker.
    expect(classify('D&B Nappe Chill Voice')).toEqual({
      category: 'D&B',
      subcategory: null,
      tags: ['D&B'],
    })
    expect(classify('Jazzy Summer ChillFort')).toMatchObject({ category: 'Jazzy Soul', subcategory: 'Summer' })
    expect(classify('Rap Game Old School Now')).toMatchObject({ category: 'Rap Game', subcategory: 'Old School' })
    expect(classify('Raggameff Dubbidub Much Higher')).toMatchObject({ category: 'Raggameff', subcategory: 'Dubbidub' })
    expect(classify('Reggaeton Chill')).toMatchObject({ category: 'Reggaeton' })
    // Classique carries no tags of its own — too few playlists for chips to
    // be worth anything, so the genre is the only thing derived from the name.
    expect(classify('Classique Opera')).toEqual({
      category: 'Classique',
      subcategory: null,
      tags: ['Classique'],
    })
    expect(classify('Classique Chillfort')).toEqual({
      category: 'Classique',
      subcategory: null,
      tags: ['Classique'],
    })
    expect(classify('Dubstep')).toMatchObject({ category: 'Dubstep' })
    expect(classify('You Must Feel This')).toMatchObject({ category: 'You Must Feel' })
  })

  it('splits the Boiler genre into its two naming families as sub-folders', () => {
    // The sub-folder repeating the genre name must not duplicate the tag.
    expect(classify('Boiler 8.0')).toEqual({
      category: 'Boiler',
      subcategory: 'Boiler',
      tags: ['Boiler'],
    })
    expect(classify('Futur Set 17')).toEqual({
      category: 'Boiler',
      subcategory: 'Futur Set',
      tags: ['Boiler', 'Futur Set'],
    })
  })

  it('returns no category for names matching no family', () => {
    expect(classify('Best Of 02/2026')).toEqual({ category: null, subcategory: null, tags: [] })
    expect(classify('Lost & Found')).toEqual({ category: null, subcategory: null, tags: [] })
  })
})

describe('deriveTagsFromName', () => {
  it('returns just the tags for tag-suggestion callers', () => {
    expect(deriveTagsFromName('Feel The Vibe Chill', taxonomy)).toEqual(['Vibes', 'English', 'chill'])
    expect(deriveTagsFromName('Lost & Found', taxonomy)).toEqual([])
  })
})
