import { useLayoutEffect, useMemo, useState } from 'react'
import { useCatalog } from '../lib/useCatalog'
import { Link } from '../lib/Link'
import { FAVORITES_PATH, replaceLocation, SIGN_IN_PATH } from '../lib/router'
import { compareTags, type CatalogPlaylist } from '../lib/catalog'
import { rememberReturnTo, useAuth } from '../lib/authStore'
import { useUserLibrary } from '../lib/userLibrary'
import SiteMenu from './SiteMenu'
import PlaylistRow from './PlaylistRow'
import './CatalogPage.css'

// The visitor's own shelf. Deliberately not the same idea as the heart on the
// catalogue, which is the owner marking a playlist for everyone — these are
// private, and nobody else can read them (see the policies in
// supabase/migrations). They are joined to the catalogue client-side on the
// Spotify id rather than stored on the playlist, so the two can never be
// mistaken for one another in code.
export default function FavoritesPage() {
  const { catalog, error } = useCatalog()
  const { status } = useAuth()
  const { favoriteIds, loading } = useUserLibrary()
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())

  // Reached signed out from the menu, or by URL. Send them to sign in,
  // remembering this shelf so they land back on it and not on the catalogue
  // home — and do it before paint, so the empty page is never seen.
  useLayoutEffect(() => {
    if (status !== 'signed-out') return
    rememberReturnTo(FAVORITES_PATH)
    replaceLocation(SIGN_IN_PATH)
  }, [status])

  const saved = useMemo<CatalogPlaylist[]>(
    () => (catalog?.playlists ?? []).filter((playlist) => favoriteIds.has(playlist.id)),
    [catalog, favoriteIds],
  )

  // Narrowed to what is actually on this shelf: offering a tag no favourite
  // carries would only ever empty the list.
  const chips = useMemo(() => {
    const tags = new Set<string>()
    for (const playlist of saved) for (const tag of playlist.tags) tags.add(tag)
    return [...tags].sort(compareTags)
  }, [saved])

  const shown = useMemo(
    () =>
      activeTags.size === 0
        ? saved
        : saved.filter((playlist) => [...activeTags].every((tag) => playlist.tags.includes(tag))),
    [saved, activeTags],
  )

  function toggleTag(tag: string): void {
    setActiveTags((current) => {
      const next = new Set(current)
      if (!next.delete(tag)) next.add(tag)
      return next
    })
  }

  return (
    <div className="catalog-page">
      <div className="hero-zone">
        <div className="hero-inner compact">
          <SiteMenu />
          <p className="kicker">
            <Link to="/" className="kicker-link">
              VLF Music
            </Link>
          </p>
          <h1>Mes favoris</h1>
        </div>
      </div>

      <main className="catalog">
        <Link to="/" className="back-link">
          <span className="back-arrow" aria-hidden="true">
            ←
          </span>
          Retour au catalogue
        </Link>

        {status === 'loading' && <p className="catalog-loading">Chargement…</p>}

        {status === 'signed-in' && (
          <>
            {error && <p className="catalog-error">Impossible de charger les playlists pour le moment.</p>}
            {(loading || (!catalog && !error)) && <p className="catalog-loading">Chargement…</p>}

            {catalog && !loading && saved.length === 0 && (
              <p className="favorites-empty">
                Aucun favori pour l’instant. Le signet au bout d’une ligne du catalogue en ajoute un.
              </p>
            )}

            {catalog && !loading && saved.length > 0 && (
              <>
                {chips.length > 1 && (
                  <div className="tag-row">
                    {chips.map((tag) => {
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
                  </div>
                )}

                <div className="tracklist">
                  {shown.map((playlist, index) => (
                    <PlaylistRow
                      key={playlist.id}
                      playlist={playlist}
                      index={index}
                      // The shelf spans every folder, so a name cut back to fit
                      // one of them would lose what tells it apart here.
                      depth={0}
                    />
                  ))}
                  {shown.length === 0 && (
                    <p className="catalog-empty">Aucun favori ne correspond à ce filtre.</p>
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
