import { slugify } from './slug'
import { compareNames } from './naturalSort.js'

// The public catalog artifact built by scripts/fetch-and-merge-playlists.mjs
// and served as /data/catalog.json — playlists plus the hand-written folder
// descriptions from data/site-content.json. Single fetch, single shape; new
// public-facing editorial fields belong here rather than in extra files.

export interface CatalogPlaylist {
  id: string
  name: string
  imageUrl: string | null
  trackCount: number
  externalUrl: string
  description: string
  /** Top-level folder on the public catalog; null lands in "Non classées". */
  category: string | null
  /** Folder inside the category (large genres only); null lands in "Autres". */
  subcategory: string | null
  tags: string[]
}

export interface FolderMeta {
  description?: string
}

export interface Catalog {
  playlists: CatalogPlaylist[]
  /** Keyed by folder key — "Techno" or "Feel/Rock" for sub-folders. */
  folders: Record<string, FolderMeta>
}

export const UNCATEGORIZED = 'Non classées'
export const OTHERS_SUBFOLDER = 'Autres'

// A category only splits into sub-folders when it's big enough for a flat
// list to be unpleasant AND its names actually carry sub-genres. Applies to
// any genre that grows past the bar — nothing is hardcoded to a genre name.
export const SUBFOLDER_MIN_PLAYLISTS = 20
const SUBFOLDER_MIN_DISTINCT = 2
// …and the sub-folders have to be worth opening: splitting 25 playlists across
// 9 sub-genres leaves ~3 behind each click, which costs more than the flat list.
const SUBFOLDER_MIN_AVERAGE = 4

export interface Folder {
  name: string
  slug: string
  /** Key into Catalog.folders — "Techno" top-level, "Feel/Rock" nested. */
  key: string
  playlists: CatalogPlaylist[]
  /** Present only on top-level folders large enough to warrant drill-down. */
  subfolders: Folder[] | null
}

// French-aware alphabetical order (é sorts with e), with the designated
// catch-all bucket pinned last so real genres always come first.
function byNameWithCatchAllLast(catchAll: string) {
  return (a: Folder, b: Folder): number => {
    if (a.name === catchAll) return 1
    if (b.name === catchAll) return -1
    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  }
}

function groupBy(playlists: CatalogPlaylist[], keyOf: (p: CatalogPlaylist) => string): Map<string, CatalogPlaylist[]> {
  const groups = new Map<string, CatalogPlaylist[]>()
  for (const playlist of playlists) {
    const key = keyOf(playlist)
    const items = groups.get(key) ?? []
    items.push(playlist)
    groups.set(key, items)
  }
  // Sorted here rather than relying on the order the catalog arrived in, so a
  // folder listing is right regardless of how the artifact was built.
  for (const items of groups.values()) {
    items.sort((a, b) => compareNames(a.name, b.name))
  }
  return groups
}

function buildSubfolders(categoryName: string, playlists: CatalogPlaylist[]): Folder[] | null {
  if (categoryName === UNCATEGORIZED || playlists.length < SUBFOLDER_MIN_PLAYLISTS) return null
  const distinct = new Set(playlists.map((p) => p.subcategory).filter((s): s is string => s !== null))
  if (distinct.size < SUBFOLDER_MIN_DISTINCT) return null

  const groups = groupBy(playlists, (p) => p.subcategory ?? OTHERS_SUBFOLDER)
  if (playlists.length / groups.size < SUBFOLDER_MIN_AVERAGE) return null

  return [...groups.entries()]
    .map(([name, items]) => ({
      name,
      slug: slugify(name),
      key: `${categoryName}/${name}`,
      playlists: items,
      subfolders: null,
    }))
    .sort(byNameWithCatchAllLast(OTHERS_SUBFOLDER))
}

export function buildFolderTree(playlists: CatalogPlaylist[]): Folder[] {
  const groups = groupBy(playlists, (p) => p.category ?? UNCATEGORIZED)
  return [...groups.entries()]
    .map(([name, items]) => ({
      name,
      slug: slugify(name),
      key: name,
      playlists: items,
      subfolders: buildSubfolders(name, items),
    }))
    .sort(byNameWithCatchAllLast(UNCATEGORIZED))
}

export interface FolderMatch {
  folder: Folder
  subfolder: Folder | null
}

export function findFolder(tree: Folder[], slug: string, subslug: string | null): FolderMatch | null {
  const folder = tree.find((f) => f.slug === slug)
  if (!folder) return null
  if (!subslug) return { folder, subfolder: null }
  const subfolder = folder.subfolders?.find((f) => f.slug === subslug) ?? null
  return subfolder ? { folder, subfolder } : null
}

/** Every folder in the tree, parents before children — for editor listings. */
export function listAllFolders(tree: Folder[]): Folder[] {
  return tree.flatMap((folder) => [folder, ...(folder.subfolders ?? [])])
}
