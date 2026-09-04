import { useEffect, useMemo, useRef, useState } from 'react'
import { useCatalog } from '../lib/useCatalog'
import { Link } from '../lib/Link'
import SiteMenu from './SiteMenu'
import PlaylistRow from './PlaylistRow'
import {
  buildFolderTree,
  compareTags,
  findFolder,
  genreLevelTags,
  type CatalogPlaylist,
  type Folder,
} from '../lib/catalog'
import './CatalogPage.css'

// Pip positions on the standard 3×3 face grid, in the 24×24 viewBox below.
const DIE_PIPS: Record<number, Array<[number, number]>> = {
  1: [[12, 12]],
  2: [
    [8.5, 8.5],
    [15.5, 15.5],
  ],
  3: [
    [8.5, 8.5],
    [12, 12],
    [15.5, 15.5],
  ],
  4: [
    [8.5, 8.5],
    [15.5, 8.5],
    [8.5, 15.5],
    [15.5, 15.5],
  ],
  5: [
    [8.5, 8.5],
    [15.5, 8.5],
    [12, 12],
    [8.5, 15.5],
    [15.5, 15.5],
  ],
  6: [
    [8.5, 8.5],
    [15.5, 8.5],
    [8.5, 12],
    [15.5, 12],
    [8.5, 15.5],
    [15.5, 15.5],
  ],
}
const DIE_FACES = Object.keys(DIE_PIPS).map(Number)

// Two paths crossing with a break where they meet, plus an arrowhead on each —
// the usual shuffle mark, drawn here rather than pulled from an icon font.
function ShuffleIcon() {
  return (
    <svg
      className="random-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 6h4l10 12h4" />
      <path d="M3 18h4l3-3.6" />
      <path d="M14 9.6L17 6h4" />
      <path d="M18 3l3 3-3 3" />
      <path d="M18 15l3 3-3 3" />
    </svg>
  )
}

function Die({ face }: { face: number }) {
  return (
    <svg className="surprise-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      {(DIE_PIPS[face] ?? DIE_PIPS[3]).map(([cx, cy]) => (
        <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="1.7" fill="currentColor" />
      ))}
    </svg>
  )
}

export default function CatalogPage({ segments }: { segments: string[] }) {
  const { catalog, error } = useCatalog()
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [tagsOpen, setTagsOpen] = useState(false)
  const [surprise, setSurprise] = useState<CatalogPlaylist | null>(null)
  const [dieFace, setDieFace] = useState(3)

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
    // The die lands on a new face every roll, for the same reason the playlist
    // does: a face that came up twice would look like the click was lost.
    setDieFace((face) => {
      const others = DIE_FACES.filter((f) => f !== face)
      return others[Math.floor(Math.random() * others.length)]
    })
  }

  // A surprise replaces the listing rather than filtering it, so backing out
  // of it restores exactly what was there before.
  const shown = surprise ? [surprise] : filtered

  // The folder's own shortcut: straight out to Spotify, no listing in between.
  // Drawn from what's actually visible, so a tag filter still applies. Kept in
  // a ref rather than state — it only guards the next click from repeating the
  // last one and nothing on screen depends on it.
  const lastRandomId = useRef<string | null>(null)
  function openRandomInSpotify() {
    const pool = filtered.length > 1 ? filtered.filter((p) => p.id !== lastRandomId.current) : filtered
    if (pool.length === 0) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    lastRandomId.current = pick.id
    window.open(pick.externalUrl, '_blank', 'noopener,noreferrer')
  }

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
        {/* Only where it's an introduction. Inside a folder it has already been
            read on the way in, and it pushed the folder's own name — the
            heading that actually matters there — down past the fold. */}
        <div className={inFolder ? 'hero-inner compact' : 'hero-inner'}>
          <SiteMenu />
          <p className="kicker">
            <Link to="/" className="kicker-link">
              VLF Music
            </Link>
          </p>
          {!inFolder && (
            <>
              <h1>Trouve ta playlist</h1>
              <p>
                {catalog ? `${catalog.playlists.length} playlists` : 'Playlists'} classées par genre, tempo et
                présence de voix.
                <br />
                Regarde le glossaire en haut à droite si tu te poses des questions.
              </p>
            </>
          )}
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

            {/* Heading and shortcut side by side, the button flush with the
                bottom of whatever the text ends on — so its distance to what
                follows is the same whether or not the folder has a
                description. Wrapping puts it under the whole block, which is
                what a phone does without needing to be told. Above the tag
                strip: name and blurb say what the folder is, and only then
                comes the means of narrowing it. */}
            {!isSearching && currentFolder && (
              <header className="folder-header">
                <div className="folder-header-text">
                  <h2>
                    {breadcrumbPrefix ? `${breadcrumbPrefix} — ` : ''}
                    {currentFolder.name}
                  </h2>
                  {folderDescription && <p>{folderDescription}</p>}
                </div>
                {/* Only where playlists are actually listed — over a grid of
                    sub-folders there is no "this folder's playlists" to draw
                    from. */}
                {listedFolder && (
                  <button
                    type="button"
                    className="random-button"
                    onClick={openRandomInSpotify}
                    disabled={filtered.length === 0}
                    title="Ouvre une playlist au hasard de ce dossier dans Spotify"
                  >
                    <ShuffleIcon />
                    Playlist aléatoire
                  </button>
                )}
              </header>
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
                  Surprends-moi
                  <Die face={dieFace} />
                </button>
              )}
              {showTagRow && (
                <>
                  {/* Inside a folder the strip is nothing but tags, so it says
                      so outright — at the top level the toggle below already
                      carries that word. */}
                  {inFolder && <span className="mixer-label">Tags</span>}
                  <div className="mixer-divider" />
                  {inFolder ? (
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
                      {/* What's filtering stays visible even when folded, so
                          the list is never quietly narrowed by something off
                          screen. */}
                      {chips.filter((tag) => activeTags.has(tag)).map((tag) => renderChip(tag))}
                      {/* Unfolds inside the same mixer box rather than a second
                          one underneath — it's still one filter strip. */}
                      {tagsOpen && chips.some((tag) => !activeTags.has(tag)) && (
                        <div className="tag-panel">
                          {chips.filter((tag) => !activeTags.has(tag)).map((tag) => renderChip(tag))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            )}

            {/* Says why a single playlist is on screen, and carries the way
                back — the mixer button itself re-rolls rather than cancels.
                The same arrow as every other way back, sitting directly above
                what it backs out of. */}
            {surprise && (
              <>
                <p className="search-summary">
                  Une petite playlist pour satisfaire ton besoin de découverte
                </p>
                <button type="button" className="back-link" onClick={() => setSurprise(null)}>
                  <span className="back-arrow" aria-hidden="true">
                    ←
                  </span>
                  Revenir aux playlists
                </button>
              </>
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
                {shown.map((playlist, index) => (
                  <PlaylistRow
                    key={playlist.id}
                    playlist={playlist}
                    index={index}
                    depth={isSearching ? 0 : matchedFolders.length}
                    impliedTags={impliedTags}
                    activeTags={activeTags}
                    onToggleTag={toggleTag}
                  />
                ))}
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
