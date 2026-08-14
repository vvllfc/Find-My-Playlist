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
  /** Milliseconds. Not available from Spotify as cheaply as trackCount, so a
   *  playlist that hasn't gone through the paginated fetch yet reads 0 —
   *  callers should treat 0 as "unknown" and not render a badge for it. */
  totalDurationMs: number
  externalUrl: string
  description: string
  /** Name with the current folder's own words cut off the front, e.g. "Feel It"
   *  inside Rap Game / EN / New School. Falls back to the full name when that
   *  would otherwise be blank. */
  displayName: string
  /** Top-level folder on the public catalog; null lands in "Non classées". */
  category: string | null
  /** Folder inside the category (large genres only); null lands in "Autres". */
  subcategory: string | null
  /** Folder inside the subcategory (Rap Game only, for now); null lands in "Autres". */
  subsubcategory: string | null
  /** Rung on the genre's calmest-to-most-energetic ladder; null sorts last. */
  energyRank: number | null
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
  // folder listing is right regardless of how the artifact was built. Every
  // folder reads calmest first, climbing its genre's own ladder; the name
  // only breaks ties inside a rung. Playlists off the ladder entirely (null)
  // close the list rather than sitting in the middle of it.
  for (const items of groups.values()) {
    items.sort((a, b) => {
      const rankA = a.energyRank ?? Number.MAX_SAFE_INTEGER
      const rankB = b.energyRank ?? Number.MAX_SAFE_INTEGER
      if (rankA !== rankB) return rankA - rankB
      return compareNames(a.name, b.name)
    })
  }
  return groups
}

// One level of grouping, applied recursively: `levelsOf` is the chain of
// extractors still to try, this level's folder name off the front, the rest
// tried one level deeper inside each group. A genre whose names carry nothing
// for the next level groups on a field that's always null, which the
// distinct-values check below turns into "no further split" on its own.
//
// `requireMinSize` guards the first split only. That bar exists to stop a
// modest genre being scattered across folders nobody asked for, but once a
// genre is already open its sub-folders divide along names that say so
// outright (Techno's House → Sunrise/Sunset, Aalmost → Lectro), and holding
// those to the same size bar would refuse splits that are plainly intended.
// The distinct-count and average checks still apply at every level.
function buildSubfolders(
  keyPrefix: string,
  playlists: CatalogPlaylist[],
  levelsOf: Array<(p: CatalogPlaylist) => string | null>,
  requireMinSize: boolean,
): Folder[] | null {
  const [levelOf, ...restLevels] = levelsOf
  if (!levelOf) return null
  if (keyPrefix === UNCATEGORIZED) return null
  if (requireMinSize && playlists.length < SUBFOLDER_MIN_PLAYLISTS) return null

  // Counted on the folders the split would actually produce, catch-all
  // included — "Lectro and everything else" is a real division of Aalmost,
  // even though only one of the two halves is named. What isn't worth a split
  // is a group that would end up as a single folder holding everything.
  const groups = groupBy(playlists, (p) => levelOf(p) ?? OTHERS_SUBFOLDER)
  if (groups.size < SUBFOLDER_MIN_DISTINCT) return null
  if (playlists.length / groups.size < SUBFOLDER_MIN_AVERAGE) return null

  return [...groups.entries()]
    .map(([name, items]) => {
      const key = `${keyPrefix}/${name}`
      return {
        name,
        slug: slugify(name),
        key,
        playlists: items,
        subfolders: buildSubfolders(key, items, restLevels, false),
      }
    })
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
      subfolders: buildSubfolders(name, items, [(p) => p.subcategory, (p) => p.subsubcategory], true),
    }))
    .sort(byNameWithCatchAllLast(UNCATEGORIZED))
}

export interface FolderMatch {
  folder: Folder
  subfolder: Folder | null
  subsubfolder: Folder | null
}

export function findFolder(
  tree: Folder[],
  slug: string,
  subslug: string | null,
  subsubslug: string | null = null,
): FolderMatch | null {
  const folder = tree.find((f) => f.slug === slug)
  if (!folder) return null
  if (!subslug) return { folder, subfolder: null, subsubfolder: null }
  const subfolder = folder.subfolders?.find((f) => f.slug === subslug) ?? null
  if (!subfolder) return null
  if (!subsubslug) return { folder, subfolder, subsubfolder: null }
  const subsubfolder = subfolder.subfolders?.find((f) => f.slug === subsubslug) ?? null
  return subsubfolder ? { folder, subfolder, subsubfolder } : null
}

/** Every folder in the tree, parents before children — for editor listings. */
export function listAllFolders(tree: Folder[]): Folder[] {
  return tree.flatMap((folder) => [folder, ...listAllFolders(folder.subfolders ?? [])])
}

// Tags that behave like a genre without being a folder — they cut across one.
// "Rock" marks the playlists actually named RockVibe, which live in several
// language folders inside Vibes.
export const CROSS_GENRE_TAGS = ['Rock']

/**
 * The handful of tags worth offering as a starting point: the genre names,
 * plus the cross-cutting ones. Everything else (tempo, era, vocals, sub-genres)
 * only appears once one of these has narrowed things down — otherwise the row
 * is 75 chips deep and useless for finding anything.
 */
export function genreLevelTags(playlists: CatalogPlaylist[]): string[] {
  const genres = new Set<string>()
  for (const playlist of playlists) {
    if (playlist.category) genres.add(playlist.category)
    for (const tag of playlist.tags) {
      if (CROSS_GENRE_TAGS.includes(tag)) genres.add(tag)
    }
  }
  return [...genres].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
}

/**
 * "2 h 27" / "42 min" for a playlist's total listening time. Null for 0 —
 * either a genuinely empty playlist or, more likely, one that hasn't been
 * through the paginated Spotify fetch yet (see `totalDurationMs` on
 * `CatalogPlaylist`) — callers should skip the badge entirely rather than
 * show a misleading "0 min".
 */
export function formatListeningTime(totalDurationMs: number): string | null {
  if (!totalDurationMs) return null
  const totalMinutes = Math.round(totalDurationMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  return `${hours} h ${String(minutes).padStart(2, '0')}`
}
