import { describe, expect, it } from 'vitest'
import { classifyPlaylistName, deriveTagsFromName } from './genreTaxonomy.js'
import taxonomy from '../../data/genre-taxonomy.json'

const classify = (name: string) => classifyPlaylistName(name, taxonomy)

describe('classifyPlaylistName', () => {
  it('splits the Vibe family by language, one sub-folder each', () => {
    expect(classify('Feel The FrenchVibe Chill')).toEqual({
      category: 'Vibes',
      subcategory: 'French Vibe',
      subsubcategory: null,
      // Tagged with the bare language, not the sub-folder's name: "French" and
      // "French Vibe" would be two chips saying one thing.
      tags: ['Vibes', 'French', 'chill'],
      // "Feel The" and the language/genre words are the folder's own text —
      // stripped from what's shown inside French Vibe, leaving just "Chill".
      displayName: 'Chill',
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
      subsubcategory: null,
      tags: ['Vibes', 'English', 'chill'],
      displayName: 'Chill',
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
    expect(classify('Feel The Punk')).toEqual({
      category: 'Punk',
      subcategory: null,
      subsubcategory: null,
      tags: ['Punk'],
      // Nothing left once "Feel The" and "Punk" are cut — falls back to the
      // full original name rather than showing a blank row.
      displayName: 'Feel The Punk',
    })
    expect(classify('Feel The French Punk Chill')).toEqual({
      category: 'Punk',
      subcategory: null,
      subsubcategory: null,
      tags: ['Punk', 'French', 'chill'],
      displayName: 'Chill',
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
      subsubcategory: null,
      tags: ['Vibes', 'Latino', 'Spanish', 'chill'],
      displayName: 'Chill',
    })
  })

  it('still files a Feel The… name with no recognized genre word under Vibes (Autres)', () => {
    expect(classify('Feel The Happiness')).toEqual({
      category: 'Vibes',
      subcategory: null,
      subsubcategory: null,
      tags: ['Vibes'],
      // No genre word to cut, so only "Feel The" (already stripped by the
      // caller before reaching here) is gone — "Happiness" stays as-is.
      displayName: 'Happiness',
    })
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
      subsubcategory: null,
      tags: ['Techno', 'Nappe', 'AfterVNR', 'vocals'],
      displayName: 'AfterVNR Voice',
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
      subsubcategory: null,
      tags: ["Wallaby's", 'Deep Rave', 'chill+'],
      displayName: 'ChillFort',
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
      subsubcategory: null,
      tags: ['D&B'],
      // No subgenre tokens for this family, so nothing more to cut than the
      // genre prefix already removed before reaching here.
      displayName: 'Nappe Chill Voice',
    })
    expect(classify('Jazzy Summer ChillFort')).toMatchObject({ category: 'Jazzy Soul', subcategory: 'Summer' })
    expect(classify('Raggameff Dubbidub Much Higher')).toMatchObject({ category: 'Raggameff', subcategory: 'Dubbidub' })
    expect(classify('Reggaeton Chill')).toMatchObject({ category: 'Reggaeton' })
    // Classique carries no tags of its own — too few playlists for chips to
    // be worth anything, so the genre is the only thing derived from the name.
    expect(classify('Classique Opera')).toEqual({
      category: 'Classique',
      subcategory: null,
      subsubcategory: null,
      tags: ['Classique'],
      displayName: 'Opera',
    })
    expect(classify('Classique Chillfort')).toEqual({
      category: 'Classique',
      subcategory: null,
      subsubcategory: null,
      tags: ['Classique'],
      displayName: 'Chillfort',
    })
    expect(classify('Dubstep')).toMatchObject({ category: 'Dubstep' })
    expect(classify('You Must Feel This')).toMatchObject({ category: 'You Must Feel' })
  })

  it('splits the Boiler genre into its two naming families as sub-folders', () => {
    // The sub-folder repeating the genre name must not duplicate the tag.
    expect(classify('Boiler 8.0')).toEqual({
      category: 'Boiler',
      subcategory: 'Boiler',
      subsubcategory: null,
      tags: ['Boiler'],
      displayName: '8.0',
    })
    expect(classify('Futur Set 17')).toEqual({
      category: 'Boiler',
      subcategory: 'Futur Set',
      subsubcategory: null,
      tags: ['Boiler', 'Futur Set'],
      displayName: '17',
    })
  })

  it('splits Rap Game by language first, then by school inside each language', () => {
    // No language marker in the name at all → English, the default.
    expect(classify('Rap Game Old School Now')).toEqual({
      category: 'Rap Game',
      subcategory: 'EN',
      subsubcategory: 'Old School',
      tags: ['Rap Game', 'EN', 'Old School', 'Now'],
      displayName: 'Now',
    })
    expect(classify('Rap Game New School Grime')).toEqual({
      category: 'Rap Game',
      subcategory: 'EN',
      subsubcategory: 'New School',
      // New School EN is the one group with its own tag vocabulary so far.
      tags: ['Rap Game', 'EN', 'New School', 'Grime'],
      displayName: 'Grime',
    })
    // A language marker moves the sub-folder, and school only applies when
    // the name actually names one.
    expect(classify('Rap Game Fr Old School Now Zepo')).toEqual({
      category: 'Rap Game',
      subcategory: 'FR',
      subsubcategory: 'Old School',
      tags: ['Rap Game', 'FR', 'Old School', 'Now'],
      displayName: 'Now Zepo',
    })
    expect(classify('Rap Game FR New Gen Much Higher')).toEqual({
      category: 'Rap Game',
      subcategory: 'FR',
      subsubcategory: 'New Gen',
      tags: ['Rap Game', 'FR', 'New Gen', 'energetic+'],
      displayName: 'Much Higher',
    })
    expect(classify('Rap Game ES Feel It Zepo')).toEqual({
      category: 'Rap Game',
      subcategory: 'ES',
      subsubcategory: null,
      tags: ['Rap Game', 'ES'],
      displayName: 'Feel It Zepo',
    })
    // No school named at all, still lands under the language.
    expect(classify('Rap Game Fr Dance')).toEqual({
      category: 'Rap Game',
      subcategory: 'FR',
      subsubcategory: null,
      tags: ['Rap Game', 'FR'],
      displayName: 'Dance',
    })
  })

  it('shows the full name when a playlist is named exactly the genre/school prefix', () => {
    // "Rap Game New School" itself, with nothing after it — stripping down to
    // the school would leave a blank row, so the full name is kept instead.
    expect(classify('Rap Game New School')).toEqual({
      category: 'Rap Game',
      subcategory: 'EN',
      subsubcategory: 'New School',
      tags: ['Rap Game', 'EN', 'New School'],
      displayName: 'Rap Game New School',
    })
  })

  it('tags the New School EN vocabulary, and only for New School EN', () => {
    expect(classify('Rap Game New School Feel It Instru Zepo').tags).toEqual([
      'Rap Game',
      'EN',
      'New School',
      'Zepo',
      'Instru',
      'Feel It',
    ])
    expect(classify('Rap Game New School Wake Up Chill').tags).toEqual(['Rap Game', 'EN', 'New School', 'Wake Up'])
    // Same words, but Old School EN and New School FR don't carry the vocabulary.
    expect(classify('Rap Game Old School Zepo').tags).not.toContain('Zepo')
    expect(classify('Rap Game Fr New Gen Instru Zepo').tags).not.toContain('Instru')
  })

  it('returns no category for names matching no family', () => {
    expect(classify('Best Of 02/2026')).toEqual({
      category: null,
      subcategory: null,
      subsubcategory: null,
      tags: [],
      displayName: 'Best Of 02/2026',
    })
    expect(classify('Lost & Found')).toEqual({
      category: null,
      subcategory: null,
      subsubcategory: null,
      tags: [],
      displayName: 'Lost & Found',
    })
  })
})

describe('deriveTagsFromName', () => {
  it('returns just the tags for tag-suggestion callers', () => {
    expect(deriveTagsFromName('Feel The Vibe Chill', taxonomy)).toEqual(['Vibes', 'English', 'chill'])
    expect(deriveTagsFromName('Lost & Found', taxonomy)).toEqual([])
  })
})
