import { useEffect, useMemo, useState } from 'react'
import { useCatalog } from '../lib/useCatalog'
import { useHashRoute } from '../lib/hashRoute'
import { buildFolderTree, findFolder, type CatalogPlaylist, type Folder } from '../lib/catalog'
import './CatalogPage.css'

export default function CatalogPage() {
  const { catalog, error } = useCatalog()
  const route = useHashRoute()
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())

  const routeMatch = /^\/genre\/([^/]+)(?:\/([^/]+))?$/.exec(route)
  const [slug, subslug] = [routeMatch?.[1] ?? null, routeMatch?.[2] ?? null]

  const tree = useMemo(() => buildFolderTree(catalog?.playlists ?? []), [catalog])
  const match = slug ? findFolder(tree, slug, subslug) : null
  const isSearching = query.trim().length > 0

  // The folder whose playlists are listed (null → we're on a folder grid).
  // A sub-foldered category shows its sub-grid, not a flat list.
  const listedFolder = match ? (match.subfolder ?? (match.folder.subfolders ? null : match.folder)) : null
  const gridFolders = match ? (listedFolder ? null : match.folder.subfolders) : tree

  // A typed search bypasses folders entirely and flattens across everything.
  const scope = useMemo<CatalogPlaylist[]>(
    () => (isSearching ? (catalog?.playlists ?? []) : (listedFolder?.playlists ?? [])),
    [isSearching, catalog, listedFolder],
  )

  // Reset the tag filter when moving between folders so a stale selection
  // can't silently hide everything in the next one.
  useEffect(() => {
    setActiveTags(new Set())
  }, [slug, subslug])

  // Tags redundant with where you already are: folder + sub-folder names.
  const impliedTags = useMemo(() => {
    if (isSearching || !match) return new Set<string>()
    return new Set([match.folder.name, ...(match.subfolder ? [match.subfolder.name] : [])])
  }, [isSearching, match])

  const scopeTags = useMemo(() => {
    const tags = new Set<string>()
    for (const playlist of scope) {
      for (const tag of playlist.tags) {
        if (!impliedTags.has(tag)) tags.add(tag)
      }
    }
    return [...tags].sort()
  }, [scope, impliedTags])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scope.filter((playlist) => {
      const matchesQuery =
        !q || playlist.name.toLowerCase().includes(q) || playlist.description.toLowerCase().includes(q)
      const matchesTags = activeTags.size === 0 || playlist.tags.some((tag) => activeTags.has(tag))
      return matchesQuery && matchesTags
    })
  }, [scope, query, activeTags])

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const currentFolder = isSearching ? null : (listedFolder ?? (match?.folder ?? null))
  const folderDescription = currentFolder ? catalog?.folders[currentFolder.key]?.description : undefined
  const backTarget = match?.subfolder ? `#/genre/${match.folder.slug}` : '#/'
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
              {(isSearching || listedFolder) && scopeTags.length > 0 && (
                <>
                  <div className="mixer-divider" />
                  {scopeTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={activeTags.has(tag) ? 'tag active' : 'tag'}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </>
              )}
            </div>

            {!isSearching && match && (
              <a href={backTarget} className="back-link">
                {backLabel}
              </a>
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

            {!isSearching && gridFolders && (
              <FolderGrid
                folders={gridFolders}
                folderMeta={catalog.folders}
                hrefOf={(f) => (match ? `#/genre/${match.folder.slug}/${f.slug}` : `#/genre/${f.slug}`)}
              />
            )}

            {(isSearching || listedFolder) && (
              <div className="tracklist">
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

function FolderGrid({
  folders,
  folderMeta,
  hrefOf,
}: {
  folders: Folder[]
  folderMeta: Record<string, { description?: string }>
  hrefOf: (folder: Folder) => string
}) {
  return (
    <div className="folder-grid">
      {folders.map((folder) => (
        <a key={folder.slug} href={hrefOf(folder)} className="folder-tile">
          <div className="folder-covers">
            {Array.from({ length: 4 }).map((_, i) => {
              const cover = folder.playlists[i]
              return cover?.imageUrl ? (
                <img key={i} src={cover.imageUrl} alt="" loading="lazy" />
              ) : (
                <div key={i} className="folder-cover-empty" />
              )
            })}
          </div>
          <p className="folder-name">{folder.name}</p>
          <p className="folder-count">
            {folder.playlists.length} playlist{folder.playlists.length > 1 ? 's' : ''}
            {folder.subfolders ? ` · ${folder.subfolders.length} dossiers` : ''}
          </p>
          {folderMeta[folder.key]?.description && (
            <p className="folder-desc">{folderMeta[folder.key].description}</p>
          )}
        </a>
      ))}
    </div>
  )
}
