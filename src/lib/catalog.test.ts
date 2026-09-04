import { describe, expect, it } from 'vitest'
import {
  buildFolderTree,
  sortPlaylists,
  compareTags,
  findFolder,
  formatListeningTime,
  listAllFolders,
  listAllTags,
  OTHERS_SUBFOLDER,
  SUBFOLDER_MIN_PLAYLISTS,
  genreLevelTags,
  UNCATEGORIZED,
  type CatalogPlaylist,
} from './catalog'

let nextId = 0
function playlist(
  category: string | null,
  subcategory: string | null = null,
  name?: string,
  subsubcategory: string | null = null,
): CatalogPlaylist {
  nextId += 1
  const playlistName = name ?? `Playlist ${String(nextId).padStart(4, '0')}`
  return {
    id: `id-${nextId}`,
    name: playlistName,
    displayNames: [playlistName, playlistName, playlistName],
    imageUrl: null,
    trackCount: 10,
    totalDurationMs: 0,
    externalUrl: 'https://open.spotify.com/playlist/x',
    description: '',
    category,
    subcategory,
    subsubcategory,
    energyRank: null,
    favorite: false,
    tags: category ? [category] : [],
  }
}

function many(
  count: number,
  category: string | null,
  subcategory: string | null = null,
  subsubcategory: string | null = null,
): CatalogPlaylist[] {
  return Array.from({ length: count }, () => playlist(category, subcategory, undefined, subsubcategory))
}

describe('buildFolderTree', () => {
  it('sorts folders alphabetically (French-aware) with the catch-all last', () => {
    const tree = buildFolderTree([
      playlist('Techno'),
      playlist(null),
      playlist('Électro Test'),
      playlist('Boiler'),
    ])
    expect(tree.map((f) => f.name)).toEqual(['Boiler', 'Électro Test', 'Techno', UNCATEGORIZED])
  })

  it('splits a big category into sub-folders, alphabetical with Autres last', () => {
    const tree = buildFolderTree([
      ...many(20, 'Techno', 'Nappe'),
      ...many(15, 'Techno', 'Acide'),
      ...many(10, 'Techno', null),
    ])
    const techno = tree[0]
    expect(techno.subfolders?.map((f) => f.name)).toEqual(['Acide', 'Nappe', OTHERS_SUBFOLDER])
    expect(techno.subfolders?.map((f) => f.key)).toEqual(['Techno/Acide', 'Techno/Nappe', `Techno/${OTHERS_SUBFOLDER}`])
  })

  it('orders a folder by energy first, name only breaking ties', () => {
    const at = (rank: number | null, name: string) => ({ ...playlist('Techno', null, name), energyRank: rank })
    const tree = buildFolderTree([
      at(null, 'Techno Brasil'),
      at(3, 'Techno After'),
      at(0, 'Techno GoodNight'),
      at(3, 'Techno After Voice'),
      at(1, 'Techno Before'),
    ])
    expect(tree[0].playlists.map((p) => p.name)).toEqual([
      'Techno GoodNight',
      'Techno Before',
      // Same rung, so the name decides between these two.
      'Techno After',
      'Techno After Voice',
      // Off the ladder entirely — closes the list rather than leading it.
      'Techno Brasil',
    ])
  })

  it('orders playlists inside a folder letters-first, numbers by value', () => {
    const tree = buildFolderTree([
      playlist('Boiler', 'Boiler', 'Boiler 12.0'),
      playlist('Boiler', 'Boiler', 'Boiler 8.0'),
      playlist('Boiler', 'Boiler', 'Boiler After'),
    ])
    expect(tree[0].playlists.map((p) => p.name)).toEqual(['Boiler After', 'Boiler 8.0', 'Boiler 12.0'])
  })

  it('keeps a category flat when its sub-genres would each hold almost nothing', () => {
    // 25 playlists across 9 sub-genres — past the size bar, but ~3 per folder.
    const scattered = Array.from({ length: 9 }, (_, i) => many(i < 7 ? 3 : 2, "Wallaby's", `Sub${i}`)).flat()
    expect(scattered).toHaveLength(25)
    expect(buildFolderTree(scattered)[0].subfolders).toBeNull()

    // Same size, two sub-genres — worth opening.
    const grouped = [...many(16, 'Boiler', 'Boiler'), ...many(5, 'Boiler', 'Futur Set')]
    expect(buildFolderTree(grouped)[0].subfolders?.map((f) => f.name)).toEqual(['Boiler', 'Futur Set'])
  })

  it('keeps small or single-subgenre categories flat', () => {
    const small = buildFolderTree([...many(5, 'Ska', 'A'), ...many(5, 'Ska', 'B')])
    expect(small[0].subfolders).toBeNull()

    const singleSub = buildFolderTree(many(SUBFOLDER_MIN_PLAYLISTS, 'Boiler', 'OnlyOne'))
    expect(singleSub[0].subfolders).toBeNull()
  })

  it('never splits the catch-all bucket', () => {
    const tree = buildFolderTree([...many(30, null, 'X'), ...many(30, null, 'Y')])
    expect(tree[0].name).toBe(UNCATEGORIZED)
    expect(tree[0].subfolders).toBeNull()
  })

  it('recurses a third level inside a sub-folder, only where it is worth it', () => {
    // Mirrors Rap Game: split by language, then — only inside the languages
    // that actually name one, and only once there's enough to bother — split
    // again by school.
    const tree = buildFolderTree([
      ...many(4, 'Rap Game', 'FR', 'Old School'),
      ...many(8, 'Rap Game', 'FR', 'New Gen'),
      ...many(13, 'Rap Game', 'FR', null),
      ...many(2, 'Rap Game', 'ES', null),
      ...many(5, 'Rap Game', 'EN', 'Old School'),
      ...many(22, 'Rap Game', 'EN', 'New School'),
    ])
    const rapGame = tree[0]
    expect(rapGame.subfolders?.map((f) => f.name)).toEqual(['EN', 'ES', 'FR'])

    const en = rapGame.subfolders?.find((f) => f.name === 'EN')
    expect(en?.subfolders?.map((f) => f.name)).toEqual(['New School', 'Old School'])
    expect(en?.subfolders?.map((f) => f.key)).toEqual(['Rap Game/EN/New School', 'Rap Game/EN/Old School'])

    const fr = rapGame.subfolders?.find((f) => f.name === 'FR')
    expect(fr?.subfolders?.map((f) => f.name)).toEqual(['New Gen', 'Old School', OTHERS_SUBFOLDER])

    // Too few playlists to be worth a third level at all — stays a flat list.
    const es = rapGame.subfolders?.find((f) => f.name === 'ES')
    expect(es?.subfolders).toBeNull()
  })

  it('lets an already-open genre split deeper than the size bar for a first split', () => {
    // Techno's Aalmost: 18 playlists, under SUBFOLDER_MIN_PLAYLISTS, but its
    // names divide along Lectro outright, so refusing the split on size alone
    // would ignore what the names plainly say.
    expect(18).toBeLessThan(SUBFOLDER_MIN_PLAYLISTS)
    const tree = buildFolderTree([
      ...many(30, 'Techno', 'House', 'Sunset'),
      ...many(8, 'Techno', 'Aalmost', 'Lectro'),
      ...many(10, 'Techno', 'Aalmost', null),
    ])
    const aalmost = tree[0].subfolders?.find((f) => f.name === 'Aalmost')
    expect(aalmost?.playlists).toHaveLength(18)
    expect(aalmost?.subfolders?.map((f) => f.name)).toEqual(['Lectro', OTHERS_SUBFOLDER])

    // The bar still guards the first split: a small genre stays flat.
    const small = buildFolderTree([...many(6, 'Ska', 'A'), ...many(6, 'Ska', 'B')])
    expect(small[0].subfolders).toBeNull()
  })
})

describe('findFolder', () => {
  const tree = buildFolderTree([...many(30, 'Techno', 'Nappe'), ...many(15, 'Techno', 'Acide'), ...many(3, 'Ska')])

  it('resolves folders and sub-folders by slug', () => {
    expect(findFolder(tree, 'ska', null)?.folder.name).toBe('Ska')
    const sub = findFolder(tree, 'techno', 'nappe')
    expect(sub?.subfolder?.key).toBe('Techno/Nappe')
    expect(findFolder(tree, 'techno', 'unknown')).toBeNull()
    expect(findFolder(tree, 'unknown', null)).toBeNull()
  })

  it('resolves a third level by slug', () => {
    const deepTree = buildFolderTree([
      ...many(5, 'Rap Game', 'EN', 'Old School'),
      ...many(22, 'Rap Game', 'EN', 'New School'),
      ...many(4, 'Rap Game', 'FR', 'Old School'),
      ...many(8, 'Rap Game', 'FR', 'New Gen'),
      ...many(13, 'Rap Game', 'FR', null),
    ])
    const deep = findFolder(deepTree, 'rap-game', 'en', 'new-school')
    expect(deep?.subsubfolder?.key).toBe('Rap Game/EN/New School')
    // A sub-slug that resolves but has no third level of its own to descend into.
    expect(findFolder(deepTree, 'rap-game', 'en', 'unknown')).toBeNull()
  })
})

describe('compareTags', () => {
  it('puts Chill Fort above Chill, where the alphabet would put it below', () => {
    expect(compareTags('Chill Fort', 'chill')).toBeLessThan(0)
    expect([...['chill', 'Chill Fort']].sort(compareTags)).toEqual(['Chill Fort', 'chill'])
  })

  it('leaves them where the alphabet already placed them among the rest', () => {
    expect(['vocals', 'chill', 'Chill Fort', 'AfterVNR', 'Melo'].sort(compareTags)).toEqual([
      'AfterVNR',
      'Chill Fort',
      'chill',
      'Melo',
      'vocals',
    ])
  })
})

describe('formatListeningTime', () => {
  it('formats under an hour as minutes only', () => {
    expect(formatListeningTime(42 * 60_000)).toBe('42 min')
  })

  it('formats an hour or more as "H h MM"', () => {
    expect(formatListeningTime(2 * 3_600_000 + 27 * 60_000)).toBe('2 h 27')
    expect(formatListeningTime(3_600_000)).toBe('1 h 00')
  })

  it('returns null for zero — unknown, not an empty playlist', () => {
    expect(formatListeningTime(0)).toBeNull()
  })
})

describe('genreLevelTags', () => {
  it('offers the genre names plus the cross-cutting ones, and nothing else', () => {
    const rock = { ...playlist('Vibes', 'English Vibe'), tags: ['Vibes', 'English', 'Rock', 'chill'] }
    const techno = { ...playlist('Techno', 'Nappe'), tags: ['Techno', 'Nappe', 'vocals'] }
    // Uncategorised playlists contribute no starting point at all.
    const loose = { ...playlist(null), tags: [] }

    expect(genreLevelTags([rock, techno, loose])).toEqual(['Rock', 'Techno', 'Vibes'])
  })

  it('leaves out a cross-cutting tag nothing carries', () => {
    const techno = { ...playlist('Techno'), tags: ['Techno'] }
    expect(genreLevelTags([techno])).toEqual(['Techno'])
  })
})

describe('listAllTags', () => {
  const rock = { ...playlist('Vibes', 'English Vibe'), tags: ['Vibes', 'Rock', 'chill'] }
  const other = { ...playlist('Vibes', 'French Vibe'), tags: ['Vibes', 'chill'] }
  const techno = { ...playlist('Techno', 'Nappe'), tags: ['Techno', 'Chill Fort'] }

  it('counts how many playlists carry each tag, and tells genres from refinements', () => {
    const entries = listAllTags({ playlists: [rock, other, techno], folders: {} })

    expect(entries.map((e) => [e.tag, e.count, e.isGenre])).toEqual([
      // Chill Fort sorts above chill rather than alphabetically below it.
      ['Chill Fort', 1, false],
      ['chill', 2, false],
      ['Rock', 1, true],
      ['Techno', 1, true],
      ['Vibes', 2, true],
    ])
  })

  it('attaches the hand-written definition where there is one', () => {
    const entries = listAllTags({
      playlists: [techno],
      folders: {},
      tags: { Techno: { description: 'La techno.' } },
    })

    expect(entries.find((e) => e.tag === 'Techno')?.description).toBe('La techno.')
    expect(entries.find((e) => e.tag === 'Chill Fort')?.description).toBeUndefined()
  })

  it('reads a catalog built before the glossary existed', () => {
    expect(listAllTags({ playlists: [techno], folders: {} })).toHaveLength(2)
  })
})

describe('listAllFolders', () => {
  it('lists parents before their sub-folders, for editor listings', () => {
    const tree = buildFolderTree([...many(30, 'Techno', 'Nappe'), ...many(15, 'Techno', 'Acide'), ...many(3, 'Ska')])
    expect(listAllFolders(tree).map((f) => f.key)).toEqual(['Ska', 'Techno', 'Techno/Acide', 'Techno/Nappe'])
  })

  it('recurses all the way down to a third level', () => {
    const tree = buildFolderTree([
      ...many(5, 'Rap Game', 'EN', 'Old School'),
      ...many(22, 'Rap Game', 'EN', 'New School'),
      ...many(5, 'Rap Game', 'ES', null),
    ])
    expect(listAllFolders(tree).map((f) => f.key)).toEqual([
      'Rap Game',
      'Rap Game/EN',
      'Rap Game/EN/New School',
      'Rap Game/EN/Old School',
      'Rap Game/ES',
    ])
  })
})

describe('sortPlaylists', () => {
  const counts = new Map([
    ['b', 5],
    ['c', 2],
  ])

  it('leaves the listing untouched in its default mode', () => {
    // The incoming order is the energy ladder built by buildFolderTree, and
    // nothing here could rebuild it — so this must not be a re-sort by the
    // same keys, it must be the identical array.
    const list = [playlist('Techno', null, 'A'), playlist('Techno', null, 'B')]
    expect(sortPlaylists(list, 'default', counts)).toBe(list)
  })

  it('puts the most voted first', () => {
    const a = { ...playlist('Techno', null, 'A'), id: 'a' }
    const b = { ...playlist('Techno', null, 'B'), id: 'b' }
    const c = { ...playlist('Techno', null, 'C'), id: 'c' }
    expect(sortPlaylists([a, b, c], 'votes', counts).map((p) => p.id)).toEqual(['b', 'c', 'a'])
  })

  it('keeps equal counts in the order they arrived', () => {
    const a = { ...playlist('Techno', null, 'A'), id: 'x' }
    const b = { ...playlist('Techno', null, 'B'), id: 'y' }
    // Neither is in the map, so both read zero — and a stable sort leaves the
    // ladder they came in with intact rather than shuffling it.
    expect(sortPlaylists([a, b], 'votes', counts).map((p) => p.id)).toEqual(['x', 'y'])
  })

  it('does not disturb the array it was given', () => {
    const a = { ...playlist('Techno', null, 'A'), id: 'a' }
    const b = { ...playlist('Techno', null, 'B'), id: 'b' }
    const list = [a, b]
    sortPlaylists(list, 'votes', counts)
    expect(list.map((p) => p.id)).toEqual(['a', 'b'])
  })
})
