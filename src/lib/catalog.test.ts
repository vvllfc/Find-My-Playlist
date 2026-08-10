import { describe, expect, it } from 'vitest'
import {
  buildFolderTree,
  findFolder,
  listAllFolders,
  OTHERS_SUBFOLDER,
  SUBFOLDER_MIN_PLAYLISTS,
  UNCATEGORIZED,
  type CatalogPlaylist,
} from './catalog'

let nextId = 0
function playlist(category: string | null, subcategory: string | null = null): CatalogPlaylist {
  nextId += 1
  return {
    id: `id-${nextId}`,
    name: `Playlist ${nextId}`,
    imageUrl: null,
    trackCount: 10,
    externalUrl: 'https://open.spotify.com/playlist/x',
    description: '',
    category,
    subcategory,
    tags: category ? [category] : [],
  }
}

function many(count: number, category: string | null, subcategory: string | null = null): CatalogPlaylist[] {
  return Array.from({ length: count }, () => playlist(category, subcategory))
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
})

describe('listAllFolders', () => {
  it('lists parents before their sub-folders, for editor listings', () => {
    const tree = buildFolderTree([...many(30, 'Techno', 'Nappe'), ...many(15, 'Techno', 'Acide'), ...many(3, 'Ska')])
    expect(listAllFolders(tree).map((f) => f.key)).toEqual(['Ska', 'Techno', 'Techno/Acide', 'Techno/Nappe'])
  })
})
