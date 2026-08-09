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
    <main className="catalog">
      <header className="catalog-header">
        <h1>Find My Playlist</h1>
        <p>Trouve la playlist qui te correspond.</p>
      </header>

      {error && <p className="catalog-error">Impossible de charger les playlists pour le moment.</p>}

      {!error && !playlists && <p className="catalog-loading">Chargement des playlists…</p>}

      {playlists && (
        <>
          <div className="catalog-controls">
            <input
              type="search"
              placeholder="Rechercher une playlist…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="catalog-search"
            />
            {allTags.length > 0 && (
              <div className="catalog-tags">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={activeTags.has(tag) ? 'tag-chip active' : 'tag-chip'}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="catalog-grid">
            {filtered.map((playlist) => (
              <a key={playlist.id} href={playlist.externalUrl} target="_blank" rel="noreferrer" className="playlist-card">
                {playlist.imageUrl ? (
                  <img src={playlist.imageUrl} alt="" className="playlist-cover" />
                ) : (
                  <div className="playlist-cover playlist-cover-placeholder" />
                )}
                <div className="playlist-info">
                  <h2>{playlist.name}</h2>
                  {playlist.description && <p>{playlist.description}</p>}
                  <div className="playlist-meta">
                    <span>{playlist.trackCount} titres</span>
                    {playlist.tags.map((tag) => (
                      <span key={tag} className="tag-chip small">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </a>
            ))}
            {filtered.length === 0 && <p className="catalog-empty">Aucune playlist ne correspond à ta recherche.</p>}
          </div>
        </>
      )}
    </main>
  )
}
