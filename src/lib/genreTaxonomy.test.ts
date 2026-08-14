import { describe, expect, it } from 'vitest'
import { classifyPlaylistName, deriveTagsFromName, energyRankOf } from './genreTaxonomy.js'
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
      energyRank: 1,
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
      energyRank: 1,
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
      energyRank: 2,
    })
    expect(classify('Feel The French Punk Chill')).toEqual({
      category: 'Punk',
      subcategory: null,
      subsubcategory: null,
      tags: ['Punk', 'French', 'chill'],
      displayName: 'Chill',
      energyRank: 1,
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
      energyRank: 1,
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
      energyRank: 2,
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
      energyRank: 4,
    })
    expect(classify('Techno Acide AfterVNR160+ Voice')).toMatchObject({
      subcategory: 'Acide',
      tags: ['Techno', 'Acide', 'AfterVNR160+', 'vocals'],
    })
    expect(classify('Techno Minimal After')).toMatchObject({ category: 'Techno', subcategory: 'Minimal' })
  })

  it('splits Techno into sub-genres, House and Aalmost one level deeper still', () => {
    expect(classify('Techno House Sunrise Middle')).toMatchObject({
      subcategory: 'House',
      subsubcategory: 'Sunrise',
    })
    expect(classify('Techno Aalmost Lectro Before')).toMatchObject({
      subcategory: 'Aalmost',
      subsubcategory: 'Lectro',
    })
    // Named families that stand on their own, rather than falling in Autres.
    expect(classify("Techno Wallaby's AfterVNR")).toMatchObject({ subcategory: "Wallaby's" })
    expect(classify('Techno Indus Before')).toMatchObject({ subcategory: 'Indus' })
    expect(classify('Techno Trance After')).toMatchObject({ subcategory: 'Trance' })
    expect(classify('Techno Brasil')).toMatchObject({ subcategory: 'Brasil' })
    // …and the ones that are still just Techno.
    expect(classify('Techno Over Middle Voice')).toMatchObject({ subcategory: null })
    expect(classify('Techno Voice After')).toMatchObject({ subcategory: null })
  })

  it('folds spelling drift into one folder rather than opening a second', () => {
    // A missing accent, a doubled letter, a stray space — same folder.
    expect(classify('Techno Lectro Middle')).toMatchObject({ subcategory: 'Léctro' })
    expect(classify('Techno Léctro Middle')).toMatchObject({ subcategory: 'Léctro' })
    expect(classify('Techno Melo After')).toMatchObject({ subcategory: 'Mélo' })
    expect(classify('Techno Almost Before Voice')).toMatchObject({ subcategory: 'Aalmost' })
    // The sub-folder's own word is not repeated as a sub-sub or a second chip.
    expect(classify('Techno Léctro After')).toMatchObject({ subsubcategory: null })
    expect(classify('Techno Léctro After').tags).toEqual(['Techno', 'Léctro', 'After'])
  })

  it('treats Deep as a Sunset qualifier, tagged but never its own folder', () => {
    // Deep only ever qualifies House Sunset, so it carries the playlist there
    // even when the name spells out neither House nor Sunset in full.
    for (const name of [
      'Techno House Deep Sunset Middle',
      'Techno House Deep Before Vocal',
      'Techno Deep Sunset Middle Voice',
      'Techno Deep House Sunset After',
    ]) {
      expect(classify(name), name).toMatchObject({ subcategory: 'House', subsubcategory: 'Sunset' })
      expect(classify(name).tags, name).toContain('Deep')
    }
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
      energyRank: 0,
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
      energyRank: 0,
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
      energyRank: 1,
    })
    expect(classify('Classique Chillfort')).toEqual({
      category: 'Classique',
      subcategory: null,
      subsubcategory: null,
      tags: ['Classique'],
      displayName: 'Chillfort',
      energyRank: 0,
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
      energyRank: null,
    })
    expect(classify('Futur Set 17')).toEqual({
      category: 'Boiler',
      subcategory: 'Futur Set',
      subsubcategory: null,
      tags: ['Boiler', 'Futur Set'],
      displayName: '17',
      energyRank: null,
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
      energyRank: 1,
    })
    expect(classify('Rap Game New School Grime')).toEqual({
      category: 'Rap Game',
      subcategory: 'EN',
      subsubcategory: 'New School',
      // New School EN is the one group with its own tag vocabulary so far.
      tags: ['Rap Game', 'EN', 'New School', 'Grime'],
      displayName: 'Grime',
      energyRank: 1,
    })
    // A language marker moves the sub-folder, and school only applies when
    // the name actually names one.
    expect(classify('Rap Game Fr Old School Now Zepo')).toEqual({
      category: 'Rap Game',
      subcategory: 'FR',
      subsubcategory: 'Old School',
      tags: ['Rap Game', 'FR', 'Old School', 'Now'],
      displayName: 'Now Zepo',
      energyRank: 0,
    })
    expect(classify('Rap Game FR New Gen Much Higher')).toEqual({
      category: 'Rap Game',
      subcategory: 'FR',
      subsubcategory: 'New Gen',
      tags: ['Rap Game', 'FR', 'New Gen', 'energetic+'],
      displayName: 'Much Higher',
      energyRank: 5,
    })
    expect(classify('Rap Game ES Feel It Zepo')).toEqual({
      category: 'Rap Game',
      subcategory: 'ES',
      subsubcategory: null,
      tags: ['Rap Game', 'ES'],
      displayName: 'Feel It Zepo',
      energyRank: 0,
    })
    // No school named at all, still lands under the language.
    expect(classify('Rap Game Fr Dance')).toEqual({
      category: 'Rap Game',
      subcategory: 'FR',
      subsubcategory: null,
      tags: ['Rap Game', 'FR'],
      displayName: 'Dance',
      energyRank: 2,
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
      energyRank: 1,
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
      energyRank: null,
    })
    expect(classify('Lost & Found')).toEqual({
      category: null,
      subcategory: null,
      subsubcategory: null,
      tags: [],
      displayName: 'Lost & Found',
      energyRank: null,
    })
  })
})

describe('energyRankOf', () => {
  // Ranks are compared against each other rather than asserted as numbers, so
  // inserting a rung into a ladder doesn't rewrite every expectation.
  const climbs = (category: string, names: string[]) => {
    const ranks = names.map((name) => energyRankOf(name, category))
    expect(ranks.every((rank) => rank !== null)).toBe(true)
    for (let i = 1; i < ranks.length; i += 1) {
      expect(
        (ranks[i - 1] as number) < (ranks[i] as number),
        `${names[i - 1]} (${ranks[i - 1]}) should sort before ${names[i]} (${ranks[i]})`,
      ).toBe(true)
    }
  }

  it('climbs the Techno night from GoodNight to AfterVNR+', () => {
    climbs('Techno', [
      'Techno Acide GoodNight',
      'Techno Acide Before',
      'Techno Acide Middle',
      'Techno Acide After',
      'Techno Acide AfterVNR',
      'Techno Acide AfterVNR160+ Voice',
    ])
  })

  it('reads every spelling of the top Techno rung as the same step', () => {
    const top = energyRankOf('Techno Acide AfterVNR160+ Voice', 'Techno')
    for (const name of [
      'Techno House Sunrise AfterVNR140+ Voice',
      'Techno Indus AfterVNR150+ Voice',
      'Techno Indus After VNR150+',
      'Techno Aalmost Lectro AfterVnr+ Voice',
      'Techno House Sunset AfterVNR+ Vocal',
      'Techno Lectro AfterVNR 160+',
      // The "+" drifting past the voice marker, all the way to the end.
      "Techno Wallaby's AfterVNR Voice 160+",
    ]) {
      expect(energyRankOf(name, 'Techno'), name).toBe(top)
    }
    // …and a plain AfterVNR is still the rung below, not folded in with them.
    expect(energyRankOf('Techno Acide AfterVNR Voice', 'Techno')).toBeLessThan(top as number)
  })

  it('puts unmarked Techno last, but unmarked tempo playlists mid-ladder', () => {
    // Not a quieter hour — simply not part of the night, so it closes the list.
    expect(energyRankOf('Techno Brasil', 'Techno')).toBeNull()

    const clouds = (name: string) => energyRankOf(name, 'Over The Clouds') as number
    expect(clouds('Over The Clouds Chill Elec Voice')).toBeLessThan(clouds('Over The Clouds (Gray)'))
    expect(clouds('Over The Clouds (Gray)')).toBeLessThan(clouds('Over The Clouds Higher Voice'))
  })

  it('climbs the tempo ladders, longest spelling winning over the word inside it', () => {
    climbs('Over The Clouds', [
      'Over The Clouds ChillFort',
      'Over The Clouds Voice Chill',
      'Over The Clouds (Gray)',
      'Over The Clouds Higher Voice',
      'Over The Clouds (EMOFast)',
      'Over The Clouds (Speed/Elec Variant)',
      'Over The Clouds (EMOVeryFast)',
    ])
    climbs("Wallaby's", [
      "Wallaby's Deep Rave ChillFort",
      "Wallaby's Hard Tracks SlowTempo",
      "Wallaby's Trance",
      "Wallaby's Deep Rave Dance",
      "Wallaby's Journey Hard",
      "Wallaby's Deep Rave DanceVNR",
    ])
    climbs('Raggameff', [
      'Raggameff Dubbidub ChillFort',
      'Raggameff Dubbidub Chill',
      'Raggameff Dubbidub',
      'Raggameff Dubbidub Higher Voice',
      'Raggameff Dubbidub Much Higher',
      'Raggameff Dubbidub Speed',
      'Raggameff Dubbidub SpeedVNR',
    ])
  })

  it('ranks Zepo as a Chill, in every genre that uses it', () => {
    expect(energyRankOf('Rap Game Fr Old School Zepo', 'Rap Game')).toBe(
      energyRankOf('Rap Game New School Wake Up Chill', 'Rap Game'),
    )
    expect(energyRankOf('Raggameff New Vibe FR Zepo', 'Raggameff')).toBe(
      energyRankOf('Raggameff New Vibe Chill', 'Raggameff'),
    )
    // Still below an unmarked playlist, which is the point of putting it there.
    expect(energyRankOf('Rap Game Fr Old School Zepo', 'Rap Game')).toBeLessThan(
      energyRankOf('Rap Game Fr', 'Rap Game') as number,
    )
  })

  it('never reads a sub-genre name as a tempo word', () => {
    // "Hard Tracks" is a Wallaby's sub-folder, so the "Hard" in it says nothing
    // about tempo — ranking the raw name would file both of these as Hard.
    const rank = (name: string) => classify(name).energyRank
    expect(rank("Wallaby's Hard Tracks")).toBe(rank("Wallaby's Trance"))
    expect(rank("Wallaby's Hard Tracks Fast")).toBeGreaterThan(rank("Wallaby's Journey Hard") as number)
    // Same trap in the genre name itself rather than the sub-folder.
    expect(rank('Feel The Metal Hardcore')).toBe(rank('Feel The German Metal'))
  })

  it('leaves genres with no ladder unranked', () => {
    expect(energyRankOf('Boiler 8.0', 'Boiler')).toBeNull()
    expect(energyRankOf('Anything', null)).toBeNull()
  })
})

describe('deriveTagsFromName', () => {
  it('returns just the tags for tag-suggestion callers', () => {
    expect(deriveTagsFromName('Feel The Vibe Chill', taxonomy)).toEqual(['Vibes', 'English', 'chill'])
    expect(deriveTagsFromName('Lost & Found', taxonomy)).toEqual([])
  })
})
