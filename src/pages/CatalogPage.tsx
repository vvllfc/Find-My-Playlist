import { useEffect, useMemo, useState } from 'react'
import { usePlaylists } from '../lib/usePlaylists'
import { useHashRoute } from '../lib/hashRoute'
import { slugify } from '../lib/slug'
import type { MergedPlaylist } from '../types'
import './CatalogPage.css'

const UNCATEGORIZED = 'Non classées'

interface Category {
  name: string
  slug: string
  items: MergedPlaylist[]
}

function categoryNameOf(playlist: MergedPlaylist): string {
  return playlist.tags[0] ?? UNCATEGORIZED
}

export default function CatalogPage() {
  const { playlists, error } = usePlaylists()
  const route = useHashRoute()
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())

  const categorySlug = /^\/genre\/(.+)$/.exec(route)?.[1] ?? null

  const categories = useMemo<Category[]>(() => {
    const byName = new Map<string, MergedPlaylist[]>()
    for (const playlist of playlists ?? []) {
      const name = categoryNameOf(playlist)
      const items = byName.get(name) ?? []
      items.push(playlist)
      byName.set(name, items)
    }
    return [...byName.entries()]
      .map(([name, items]) => ({ name, slug: slugify(name), items }))
      .sort((a, b) => {
        if (a.name === UNCATEGORIZED) return 1
        if (b.name === UNCATEGORIZED) return -1
        return b.items.length - a.items.length
      })
  }, [playlists])

  const activeCategory = categorySlug ? (categories.find((c) => c.slug === categorySlug) ?? null) : null
  const isSearching = query.trim().length > 0

  // A typed search bypasses the folder view entirely and flattens across
  // every playlist, regardless of which category (if any) is open.
  const scope = useMemo(
    () => (isSearching ? (playlists ?? []) : activeCategory ? activeCategory.items : []),
    [isSearching, playlists, activeCategory],
  )

  // Reset the tag filter whenever the category changes so a stale filter
  // from a previous folder can't silently hide everything in the new one.
  useEffect(() => {
    setActiveTags(new Set())
  }, [categorySlug])

  const scopeTags = useMemo(() => {
    const tags = new Set<string>()
    for (const playlist of scope) {
      for (const tag of playlist.tags) {
        // The category name itself is redundant once you're inside its folder.
        if (!isSearching && activeCategory && tag === activeCategory.name) continue
        tags.add(tag)
      }
    }
    return [...tags].sort()
  }, [scope, isSearching, activeCategory])

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

  function visibleTags(playlist: MergedPlaylist): string[] {
    if (isSearching || !activeCategory) return playlist.tags
    return playlist.tags.filter((tag) => tag !== activeCategory.name)
  }

  const showFolders = !isSearching && !activeCategory

  return (
    <div className="catalog-page">
      <div className="hero-zone">
        <div className="hero-inner">
          <p className="kicker">VLF Music</p>
          <h1>Trouve ta playlist</h1>
          <p>
            {playlists ? `${playlists.length} playlists` : 'Playlists'} triées par genre, tempo et présence de
            voix — cherche par nom ou parcours les dossiers.
          </p>
        </div>
      </div>

      <main className="catalog">
        {error && <p className="catalog-error">Impossible de charger les playlists pour le moment.</p>}

        {!error && !playlists && <p className="catalog-loading">Chargement des playlists…</p>}

        {playlists && (
          <>
            <div className="mixer" role="search">
              <input
                type="search"
                placeholder="Rechercher une playlist…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Rechercher une playlist"
              />
              {!showFolders && scopeTags.length > 0 && (
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

            {showFolders && (
              <div className="folder-grid">
                {categories.map((category) => (
                  <a key={category.slug} href={`#/genre/${category.slug}`} className="folder-tile">
                    <div className="folder-covers">
                      {Array.from({ length: 4 }).map((_, i) => {
                        const cover = category.items[i]
                        return cover?.imageUrl ? (
                          <img key={i} src={cover.imageUrl} alt="" loading="lazy" />
                        ) : (
                          <div key={i} className="folder-cover-empty" />
                        )
                      })}
                    </div>
                    <p className="folder-name">{category.name}</p>
                    <p className="folder-count">
                      {category.items.length} playlist{category.items.length === 1 ? '' : 's'}
                    </p>
                  </a>
                ))}
              </div>
            )}

            {!showFolders && (
              <>
                {!isSearching && activeCategory && (
                  <a href="#/" className="back-link">
                    ← Tous les genres
                  </a>
                )}
                {isSearching && (
                  <p className="search-summary">
                    {filtered.length} résultat{filtered.length > 1 ? 's' : ''} pour «&nbsp;{query.trim()}&nbsp;»
                  </p>
                )}

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
                          {visibleTags(playlist).map((tag) => (
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
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}