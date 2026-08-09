import { useMemo, useState } from 'react'
import { usePlaylists } from '../lib/usePlaylists'
import './CatalogPage.css'

export default function CatalogPage() {
  const { playlists, error } = usePlaylists()
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const playlist of playlists ?? []) {
      for (const tag of playlist.tags) tags.add(tag)
    }
    return [...tags].sort()
  }, [playlists])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (playlists ?? []).filter((playlist) => {
      const matchesQuery =
        !q || playlist.name.toLowerCase().includes(q) || playlist.description.toLowerCase().includes(q)
      const matchesTags = activeTags.size === 0 || playlist.tags.some((tag) => activeTags.has(tag))
      return matchesQuery && matchesTags
    })
  }, [playlists, query, activeTags])

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  return (
    <>
      <div className="hero-zone">
        <div className="hero-inner">
          <p className="kicker">Find My Playlist</p>
          <h1>Trouve ta playlist</h1>
          <p>{playlists ? `${playlists.length} playlists` : 'Playlists'} triées par genre, tempo et présence de voix — cherche par nom ou filtre par tag.</p>
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
              {allTags.length > 0 && (
                <>
                  <div className="mixer-divider" />
                  {allTags.map((tag) => (
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

            <div className="tracklist">
              {filtered.map((playlist, index) => (
                <a key={playlist.id} href={playlist.externalUrl} target="_blank" rel="noreferrer" className="row">
                  <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="row-main">
                    <p className="name">{playlist.name}</p>
                    {playlist.description && <p className="desc">{playlist.description}</p>}
                    <span className="row-tags">
                      {playlist.tags.map((tag) => (
                        <span key={tag} className={tag.toLowerCase() === 'vocals' ? 'chip voice' : 'chip'}>
                          {tag}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="row-count">{playlist.trackCount} titres</span>
                </a>
              ))}
              {filtered.length === 0 && <p className="catalog-empty">Aucune playlist ne correspond à ta recherche.</p>}
            </div>
          </>
        )}
      </main>
    </>
  )
}
