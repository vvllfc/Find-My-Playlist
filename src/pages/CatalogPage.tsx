import { useEffect, useMemo, useState } from 'react'
import { useCatalog } from '../lib/useCatalog'
import { Link } from '../lib/Link'
import { buildFolderTree, findFolder, genreLevelTags, type CatalogPlaylist, type Folder } from '../lib/catalog'
import './CatalogPage.css'

export default function CatalogPage({ segments }: { segments: string[] }) {
  const { catalog, error } = useCatalog()
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [tagsOpen, setTagsOpen] = useState(false)

  const [slug, subslug] = segments[0] === 'genre' ? [segments[1] ?? null, segments[2] ?? null] : [null, null]

  const tree = useMemo(() => buildFolderTree(catalog?.playlists ?? []), [catalog])
  const match = slug ? findFolder(tree, slug, subslug) : null
  const isSearching = query.trim().length > 0

  // The folder whose playlists are listed (null → we're on a folder grid).
  // A sub-foldered category shows its sub-grid, not a flat list.
  const listedFolder = match ? (match.subfolder ?? (match.folder.subfolders ? null : match.folder)) : null
  const gridFolders = match ? (listedFolder ? null : match.folder.subfolders) : tree

  // Inside a folder we work from its playlists — including when it's showing a
  // sub-grid rather than a list, otherwise its chips would be drawn from the
  // whole catalog and offer tags no playlist here carries. Everywhere else —
  // searching, or picking a genre from the home row — it's the full catalog.
  const scope = useMemo<CatalogPlaylist[]>(() => {
    if (isSearching) return catalog?.playlists ?? []
    if (listedFolder) return listedFolder.playlists
    if (match) return match.folder.playlists
    return catalog?.playlists ?? []
  }, [isSearching, catalog, listedFolder, match])

  // Reset the tag filter when moving between folders so a stale selection
  // can't silently hide everything in the next one.
  useEffect(() => {
    setActiveTags(new Set())
  }, [slug, subslug])

  // Tags redundant with where you already are: the folder and sub-folder
  // names, plus anything already spelled out inside them — the "French" tag
  // says nothing new on every row of the "French Vibe" folder.
  const impliedTags = useMemo(() => {
    if (isSearching || !match) return new Set<string>()
    const names = [match.folder.name, ...(match.subfolder ? [match.subfolder.name] : [])]
    const implied = new Set(names)
    for (const name of names) for (const word of name.split(' ')) implied.add(word)
    return implied
  }, [isSearching, match])

  // Everything the current selection narrows down to. Selections combine with
  // AND, which is what lets the chip row shrink as you go: a chip is only
  // offered while something still carries it.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scope.filter((playlist) => {
      const matchesQuery =
        !q || playlist.name.toLowerCase().includes(q) || playlist.description.toLowerCase().includes(q)
      const matchesTags = [...activeTags].every((tag) => playlist.tags.includes(tag))
      return matchesQuery && matchesTags
    })
  }, [scope, query, activeTags])

  // Inside a folder the genre is a given, so the row goes straight to the
  // detail; at the top it starts with genres only and opens up from there.
  const genreTags = useMemo(() => genreLevelTags(catalog?.playlists ?? []), [catalog])
  const pickedGenre = [...activeTags].find((tag) => genreTags.includes(tag)) ?? null
  const showGenreRow = !match && !pickedGenre

  const chips = useMemo(() => {
    // Narrowed to the genres actually reachable — a search for "techno" has no
    // reason to still offer Ska.
    if (showGenreRow) {
      const reachable = new Set(filtered.flatMap((p) => p.tags))
      return genreTags.filter((tag) => reachable.has(tag))
    }
    const tags = new Set<string>()
    for (const playlist of filtered) {
      for (const tag of playlist.tags) {
        if (impliedTags.has(tag)) continue
        if (genreTags.includes(tag) && tag !== pickedGenre) continue
        tags.add(tag)
      }
    }
    return [...tags].sort((a, b) => {
      // The chosen genre leads the row, so it stays easy to click off.
      if (a === pickedGenre) return -1
      if (b === pickedGenre) return 1
      return a.localeCompare(b, 'fr', { sensitivity: 'base' })
    })
  }, [showGenreRow, genreTags, filtered, impliedTags, pickedGenre])

  // Genres keep the green already used for folders; refinements take the
  // violet already worn by the tags under playlist names.
  function renderChip(tag: string) {
    const selected = activeTags.has(tag)
    return (
      <button
        key={tag}
        type="button"
        className={['tag', genreTags.includes(tag) ? 'tag-genre' : 'tag-detail', selected ? 'active' : '']
          .filter(Boolean)
          .join(' ')}
        aria-pressed={selected}
        onClick={() => toggleTag(tag)}
      >
        {tag}
      </button>
    )
  }

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
        // Dropping the genre drops what was refining it — those chips are
        // about to disappear, and leaving them active would filter invisibly.
        if (genreTags.includes(tag)) next.clear()
      } else {
        next.add(tag)
      }
      return next
    })
  }

  // Route only, deliberately not the query — otherwise every keystroke in the
  // search box would replay the arrival animation.
  const routeKey = `${slug ?? ''}/${subslug ?? ''}`
  const currentFolder = isSearching ? null : (listedFolder ?? match?.folder ?? null)
  const folderDescription = currentFolder ? catalog?.folders[currentFolder.key]?.description : undefined
  const backTarget = match?.subfolder ? `/genre/${match.folder.slug}` : '/'
  const backLabel = match?.subfolder ? `← ${match.folder.name}` : '← Tous les genres'

  return (
    <div className="catalog-page">
      <div className="hero-zone">
        <div className="hero-inner">
          <p className="kicker">VLF Music</p>
          <h1>Trouve ta playlist</h1>
          <p>
            {catalog ? `${catalog.playlists.length} playlists` : 'Playlists'} triées par genre, tempo et présence
            de voix — cherche par nom ou parcours les dossiers.
          </p>
        </div>
      </div>

      <main className="catalog">
        {error && <p className="catalog-error">Impossible de charger les playlists pour le moment.</p>}

        {!error && !catalog && <p className="catalog-loading">Chargement des playlists…</p>}

        {catalog && (
          <>
            <div className="mixer" role="search">
              <input
                type="search"
                placeholder="Rechercher une playlist…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Rechercher une playlist"
              />
              {chips.length > 0 && (
                <>
                  <div className="mixer-divider" />
                  {/* Folded away by default: laid out flat, twenty-odd genres
                      filled the screen on a phone before any playlist showed. */}
                  <button
                    type="button"
                    className={tagsOpen ? 'tag tag-toggle open' : 'tag tag-toggle'}
                    aria-expanded={tagsOpen}
                    onClick={() => setTagsOpen((open) => !open)}
                  >
                    Tags{activeTags.size > 0 ? ` · ${activeTags.size}` : ''}
                  </button>
                  {/* What's filtering stays visible even when folded, so the
                      list is never quietly narrowed by something off screen. */}
                  {chips.filter((tag) => activeTags.has(tag)).map((tag) => renderChip(tag))}
                </>
              )}
            </div>

            {tagsOpen && chips.some((tag) => !activeTags.has(tag)) && (
              <div className="tag-panel">{chips.filter((tag) => !activeTags.has(tag)).map((tag) => renderChip(tag))}</div>
            )}

            {!isSearching && match && (
              <Link to={backTarget} className="back-link">
                {backLabel}
              </Link>
            )}
            {!isSearching && currentFolder && (
              <header className="folder-header">
                <h2>
                  {match?.subfolder ? `${match.folder.name} — ` : ''}
                  {currentFolder.name}
                </h2>
                {folderDescription && <p>{folderDescription}</p>}
              </header>
            )}
            {isSearching && (
              <p className="search-summary">
                {filtered.length} résultat{filtered.length > 1 ? 's' : ''} pour «&nbsp;{query.trim()}&nbsp;»
              </p>
            )}

            {!isSearching && gridFolders && activeTags.size === 0 && (
              <FolderGrid
                // Remounts on each move so the arrival animation replays; React
                // would otherwise reuse the same grid element between levels.
                key={routeKey}
                folders={gridFolders}
                folderMeta={catalog.folders}
                depth={match ? 2 : 1}
                hrefOf={(f) => (match ? `/genre/${match.folder.slug}/${f.slug}` : `/genre/${f.slug}`)}
              />
            )}

            {(isSearching || listedFolder || activeTags.size > 0) && (
              <div className="tracklist" key={routeKey}>
                {filtered.map((playlist, index) => (
                  <a
                    key={playlist.id}
                    href={playlist.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="row"
                  >
                    <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="row-main">
                      <p className="name">{playlist.name}</p>
                      {playlist.description && <p className="desc">{playlist.description}</p>}
                      <span className="row-tags">
                        {playlist.tags
                          .filter((tag) => !impliedTags.has(tag))
                          .map((tag) => (
                            <span key={tag} className={activeTags.has(tag) ? 'chip matched' : 'chip'}>
                              {tag}
                            </span>
                          ))}
                      </span>
                    </span>
                    <span className="row-count">{playlist.trackCount} titres</span>
                  </a>
                ))}
                {filtered.length === 0 && (
                  <p className="catalog-empty">Aucune playlist ne correspond à ta recherche.</p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// Below four playlists a 2×2 mosaic is mostly empty squares, so a single
// full-size cover reads better. Either way, only playlists that actually have
// artwork are used — skipping the blanks rather than leaving holes in the grid.
function FolderCovers({ folder }: { folder: Folder }) {
  const covers = folder.playlists.filter((p) => p.imageUrl)

  if (folder.playlists.length < 4) {
    return (
      <div className="folder-covers single">
        {covers[0] ? (
          <img src={covers[0].imageUrl ?? ''} alt="" loading="lazy" />
        ) : (
          <div className="folder-cover-empty" />
        )}
      </div>
    )
  }

  return (
    <div className="folder-covers">
      {Array.from({ length: 4 }).map((_, i) =>
        covers[i] ? (
          <img key={i} src={covers[i].imageUrl ?? ''} alt="" loading="lazy" />
        ) : (
          <div key={i} className="folder-cover-empty" />
        ),
      )}
    </div>
  )
}

function FolderGrid({
  folders,
  folderMeta,
  depth,
  hrefOf,
}: {
  folders: Folder[]
  folderMeta: Record<string, { description?: string }>
  depth: number
  hrefOf: (folder: Folder) => string
}) {
  return (
    <div className="folder-grid">
      {folders.map((folder) => (
        <Link
          key={folder.slug}
          to={hrefOf(folder)}
          className="folder-tile"
          // How the transition finds the tile the grid pushes away from. Depth
          // is part of it because a folder can contain a sub-folder repeating
          // its own slug (Boiler does).
          data-folder-slug={folder.slug}
          data-folder-depth={depth}
        >
          <FolderCovers folder={folder} />
          <p className="folder-name">{folder.name}</p>
          {folderMeta[folder.key]?.description && (
            <p className="folder-desc">{folderMeta[folder.key].description}</p>
          )}
          <p className="folder-count">
            {folder.playlists.length} playlist{folder.playlists.length > 1 ? 's' : ''}
          </p>
        </Link>
      ))}
    </div>
  )
}
