import { useEffect, useMemo, useState } from 'react'
import { useCatalog } from '../lib/useCatalog'
import { Link } from '../lib/Link'
import {
  buildFolderTree,
  compareTags,
  displayNameAtDepth,
  findFolder,
  formatListeningTime,
  genreLevelTags,
  type CatalogPlaylist,
  type Folder,
} from '../lib/catalog'
import './CatalogPage.css'

export default function CatalogPage({ segments }: { segments: string[] }) {
  const { catalog, error } = useCatalog()
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [tagsOpen, setTagsOpen] = useState(false)
  const [surprise, setSurprise] = useState<CatalogPlaylist | null>(null)

  const [slug, subslug, subsubslug] =
    segments[0] === 'genre' ? [segments[1] ?? null, segments[2] ?? null, segments[3] ?? null] : [null, null, null]

  const tree = useMemo(() => buildFolderTree(catalog?.playlists ?? []), [catalog])
  const match = slug ? findFolder(tree, slug, subslug, subsubslug) : null
  const isSearching = query.trim().length > 0

  // Every folder resolved by the route, root first — the last one is the
  // deepest point reached, however many levels deep that is.
  const matchedFolders = useMemo(
    () => (match ? [match.folder, match.subfolder, match.subsubfolder].filter((f): f is Folder => f !== null) : []),
    [match],
  )
  const current = matchedFolders.length > 0 ? matchedFolders[matchedFolders.length - 1] : null

  // The folder whose playlists are listed (null → we're on a folder grid).
  // A sub-foldered folder shows its sub-grid, not a flat list, however deep
  // it sits — Rap Game / FR still opens onto Old School / New Gen rather than
  // straight to a list.
  const listedFolder = current && !current.subfolders ? current : null
  const gridFolders = current ? current.subfolders : tree

  // Inside a folder we work from its playlists — including when it's showing a
  // sub-grid rather than a list, otherwise its chips would be drawn from the
  // whole catalog and offer tags no playlist here carries. Everywhere else —
  // searching, or picking a genre from the home row — it's the full catalog.
  const scope = useMemo<CatalogPlaylist[]>(() => {
    if (isSearching) return catalog?.playlists ?? []
    if (current) return current.playlists
    return catalog?.playlists ?? []
  }, [isSearching, catalog, current])

  // Reset the filters when moving between folders so a stale selection can't
  // silently hide everything in the next one. The query goes with them: the
  // search box isn't rendered inside a folder, so a query left over from
  // before would narrow the list with nothing on screen to say why.
  useEffect(() => {
    setActiveTags(new Set())
    setQuery('')
    setSurprise(null)
  }, [slug, subslug, subsubslug])

  // Tags redundant with where you already are: the names of every folder on
  // the path here, plus anything already spelled out inside them — the
  // "French" tag says nothing new on every row of the "French Vibe" folder.
  const impliedTags = useMemo(() => {
    if (isSearching || matchedFolders.length === 0) return new Set<string>()
    const names = matchedFolders.map((f) => f.name)
    const implied = new Set(names)
    for (const name of names) for (const word of name.split(' ')) implied.add(word)
    return implied
  }, [isSearching, matchedFolders])

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
      return compareTags(a, b)
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
    // Filtering is a deliberate move back to the whole list — keeping a single
    // random playlist on screen would make the new filter look broken.
    setSurprise(null)
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

  // Drawn from whatever is currently on screen rather than the whole catalog,
  // so a surprise inside Techno is a Techno playlist and a surprise on a
  // search is one of its results. Re-rolling never hands back the one already
  // showing — a button that visibly does nothing reads as broken.
  function pickSurprise() {
    const pool = filtered.length > 1 ? filtered.filter((p) => p.id !== surprise?.id) : filtered
    if (pool.length === 0) return
    setSurprise(pool[Math.floor(Math.random() * pool.length)])
  }

  // A surprise replaces the listing rather than filtering it, so backing out
  // of it restores exactly what was there before.
  const shown = surprise ? [surprise] : filtered

  // Inside a folder the search box goes away — the folder is the query. What
  // stays is the tag row, and only where playlists are actually listed: over a
  // grid of sub-folders the chips filter nothing you can see. No folder carries
  // more than eight of them, so they sit open instead of behind the toggle.
  const inFolder = Boolean(match)
  const showTagRow = chips.length > 0 && (!inFolder || Boolean(listedFolder))
  const showMixer = !inFolder || showTagRow

  // Route only, deliberately not the query — otherwise every keystroke in the
  // search box would replay the arrival animation.
  const routeKey = `${slug ?? ''}/${subslug ?? ''}/${subsubslug ?? ''}`
  const currentFolder = isSearching ? null : (listedFolder ?? current)
  const folderDescription = currentFolder ? catalog?.folders[currentFolder.key]?.description : undefined
  // One level up from wherever the route currently sits, however deep that is.
  const ancestorFolders = matchedFolders.slice(0, -1)
  const backTarget =
    ancestorFolders.length > 0 ? `/genre/${ancestorFolders.map((f) => f.slug).join('/')}` : '/'
  const backLabel = ancestorFolders.length > 0 ? ancestorFolders[ancestorFolders.length - 1].name : 'Tous les genres'
  const breadcrumbPrefix = ancestorFolders.map((f) => f.name).join(' — ')

  return (
    <div className="catalog-page">
      <div className="hero-zone">
        <div className="hero-inner">
          <p className="kicker">VLF Music</p>
          <h1>Trouve ta playlist</h1>
          <p>
            {catalog ? `${catalog.playlists.length} playlists` : 'Playlists'} classées par genre, tempo et présence
            de voix.
            <br />
            Dans chaque dossier, elles sont rangées par tempo&nbsp;: toujours du plus chill au plus NRV.
          </p>
        </div>
      </div>

      <main className="catalog">
        {error && <p className="catalog-error">Impossible de charger les playlists pour le moment.</p>}

        {!error && !catalog && <p className="catalog-loading">Chargement des playlists…</p>}

        {catalog && (
          <>
            {/* Above the filter strip rather than below it: it's the way out,
                and behind three rows of chips on a phone it was being missed. */}
            {!isSearching && match && (
              <Link to={backTarget} className="back-link">
                <span className="back-arrow" aria-hidden="true">
                  ←
                </span>
                {backLabel}
              </Link>
            )}

            {/* Nothing left to put in it inside a folder showing sub-folders:
                no search, no action, no useful chips — so the box itself goes
                rather than sitting there empty. */}
            {showMixer && (
            <div
              className="mixer"
              role={inFolder ? 'group' : 'search'}
              aria-label={inFolder ? 'Filtrer les playlists' : undefined}
            >
              {!inFolder && (
                <input
                  type="search"
                  placeholder="Rechercher une playlist…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSurprise(null)
                  }}
                  aria-label="Rechercher une playlist"
                />
              )}
              {/* Only alongside the search box, and deliberately not a chip:
                  it acts on the catalog instead of narrowing it. */}
              {!inFolder && (
                <button
                  type="button"
                  className="surprise-button"
                  onClick={pickSurprise}
                  disabled={filtered.length === 0}
                >
                  <svg className="surprise-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
                    <circle cx="8.5" cy="8.5" r="1.6" fill="currentColor" />
                    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                    <circle cx="15.5" cy="15.5" r="1.6" fill="currentColor" />
                  </svg>
                  Surprends-moi
                </button>
              )}
              {showTagRow && !inFolder && <div className="mixer-divider" />}
              {showTagRow &&
                (inFolder ? (
                  chips.map((tag) => renderChip(tag))
                ) : (
                  <>
                    {/* Folded away at the top level only: laid out flat,
                        twenty-odd genres filled the screen on a phone before
                        any playlist showed. A folder's handful doesn't. */}
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
                    {/* Unfolds inside the same mixer box rather than a second
                        one underneath — it's still one filter strip. */}
                    {tagsOpen && chips.some((tag) => !activeTags.has(tag)) && (
                      <div className="tag-panel">
                        {chips.filter((tag) => !activeTags.has(tag)).map((tag) => renderChip(tag))}
                      </div>
                    )}
                  </>
                ))}
            </div>
            )}

            {!isSearching && currentFolder && (
              <header className="folder-header">
                <h2>
                  {breadcrumbPrefix ? `${breadcrumbPrefix} — ` : ''}
                  {currentFolder.name}
                </h2>
                {folderDescription && <p>{folderDescription}</p>}
              </header>
            )}
            {/* Says why a single playlist is on screen, and carries the way
                back — the mixer button itself re-rolls rather than cancels. */}
            {surprise && (
              <p className="search-summary">
                Une playlist au hasard.{' '}
                <button type="button" className="summary-action" onClick={() => setSurprise(null)}>
                  Tout afficher
                </button>
              </p>
            )}
            {isSearching && !surprise && (
              <p className="search-summary">
                {filtered.length} résultat{filtered.length > 1 ? 's' : ''} pour «&nbsp;{query.trim()}&nbsp;»
              </p>
            )}

            {!isSearching && !surprise && gridFolders && activeTags.size === 0 && (
              <FolderGrid
                // Remounts on each move so the arrival animation replays; React
                // would otherwise reuse the same grid element between levels.
                key={routeKey}
                folders={gridFolders}
                folderMeta={catalog.folders}
                depth={matchedFolders.length + 1}
                hrefOf={(f) => ['', 'genre', ...matchedFolders.map((m) => m.slug), f.slug].join('/')}
              />
            )}

            {(isSearching || listedFolder || activeTags.size > 0 || surprise) && (
              <div className="tracklist" key={routeKey}>
                {shown.map((playlist, index) => {
                  const listeningTime = formatListeningTime(playlist.totalDurationMs)
                  return (
                    // A div rather than the link itself: the tags below the name
                    // are buttons now, and a button can't sit inside an anchor.
                    // The name's link is stretched back over the whole row in
                    // CSS, so clicking anywhere still opens Spotify — except on
                    // a tag, which sits above it and filters instead.
                    <div key={playlist.id} className={playlist.favorite ? 'row favorite' : 'row'}>
                      {playlist.favorite && (
                        <span className="row-heart" role="img" aria-label="Coup de cœur">
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path
                              fill="currentColor"
                              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                            />
                          </svg>
                        </span>
                      )}
                      <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="row-main">
                        {/* Cut back by how deep the folder actually is: its own
                            words say nothing new, but a sub-genre that never
                            became a folder still tells them apart. A search or
                            a catalog-wide tag filter spans everything, so
                            there the full name is what's meaningful. */}
                        <p className="name">
                          <a href={playlist.externalUrl} target="_blank" rel="noreferrer" className="row-link">
                            {displayNameAtDepth(playlist, isSearching ? 0 : matchedFolders.length)}
                          </a>
                        </p>
                        {playlist.description && <p className="desc">{playlist.description}</p>}
                        <span className="row-tags">
                          {playlist.tags
                            .filter((tag) => !impliedTags.has(tag))
                            .map((tag) => {
                              const selected = activeTags.has(tag)
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  className={selected ? 'chip matched' : 'chip'}
                                  aria-pressed={selected}
                                  aria-label={`${selected ? 'Retirer le filtre' : 'Filtrer par'} ${tag}`}
                                  onClick={() => toggleTag(tag)}
                                >
                                  {tag}
                                </button>
                              )
                            })}
                        </span>
                      </span>
                      <span className="row-meta">
                        {listeningTime && <span className="row-duration">{listeningTime}</span>}
                        <span className="row-count">{playlist.trackCount} titres</span>
                      </span>
                    </div>
                  )
                })}
                {shown.length === 0 && (
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
