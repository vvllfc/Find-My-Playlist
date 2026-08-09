import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { SPOTIFY_CLIENT_ID } from '../config'
import { clearTokens, ensureFreshAccessToken, isLoggedIn, startLogin } from '../lib/spotifyAuth'
import { fetchMyPlaylists, updatePlaylistDetails } from '../lib/spotifyApi'
import { clearCachedEditPlaylists, getCachedEditPlaylists, setCachedEditPlaylists, updateCachedEditPlaylist } from '../lib/editPlaylistsCache'
import { isUnlocked } from '../lib/adminGate'
import PasswordGate from './PasswordGate'
import './CatalogPage.css'
import './AdminShared.css'

export default function ModifyPage() {
  const [unlocked, setUnlocked] = useState(isUnlocked())

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />
  }

  return (
    <div className="catalog-page">
      <div className="hero-zone">
        <div className="hero-inner">
          <p className="kicker">VLF Music</p>
          <h1>Modifier mes playlists</h1>
          <p>Connexion Spotify directe pour éditer nom et description — publiques ou privées.</p>
        </div>
      </div>
      <main className="catalog">
        <SpotifyDirectEditor />
      </main>
    </div>
  )
}

function SpotifyDirectEditor() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn('edit'))
  const [playlists, setPlaylists] = useState(() => getCachedEditPlaylists())
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refreshList = useCallback(async () => {
    const token = await ensureFreshAccessToken('edit')
    if (!token) {
      setLoggedIn(false)
      return
    }
    setLoading(true)
    setStatus('Chargement des playlists Spotify…')
    try {
      const fresh = await fetchMyPlaylists(token)
      setCachedEditPlaylists(fresh)
      setPlaylists(fresh)
      setStatus(null)
    } catch {
      setStatus('Impossible de charger tes playlists Spotify.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Only fetch automatically when logged in with nothing cached yet (first
  // ever use on this device/browser) — otherwise reuse the cache and wait
  // for an explicit "Rafraîchir la liste" click, to keep Spotify calls low.
  useEffect(() => {
    if (loggedIn && !getCachedEditPlaylists()) refreshList()
  }, [loggedIn, refreshList])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !playlists) return playlists ?? []
    return playlists.filter((p) => p.name.toLowerCase().includes(q))
  }, [playlists, query])

  function select(id: string) {
    setSelectedId(id)
    const playlist = playlists?.find((p) => p.id === id)
    setName(playlist?.name ?? '')
    setDescription(playlist?.description ?? '')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    const token = await ensureFreshAccessToken('edit')
    if (!token) {
      setLoggedIn(false)
      return
    }
    setStatus('Enregistrement sur Spotify…')
    try {
      await updatePlaylistDetails(token, selectedId, { name, description })
      updateCachedEditPlaylist(selectedId, { name, description })
      setPlaylists(getCachedEditPlaylists())
      setStatus('Enregistré sur Spotify. Pense à "Rafraîchir le site maintenant" sur #/admin pour resynchroniser le site.')
    } catch {
      setStatus("Échec de l'enregistrement sur Spotify.")
    }
  }

  if (!SPOTIFY_CLIENT_ID) {
    return <p className="hint">SPOTIFY_CLIENT_ID n'est pas encore renseigné dans src/config.ts.</p>
  }

  if (!loggedIn) {
    return (
      <button type="button" className="tag active" onClick={() => startLogin('edit')}>
        Connecter Spotify
      </button>
    )
  }

  return (
    <>
      <div className="mixer" role="search">
        <input
          type="search"
          placeholder="Rechercher une playlist…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher une playlist"
        />
        <div className="mixer-divider" />
        <button type="button" className="tag" onClick={refreshList} disabled={loading}>
          Rafraîchir la liste
        </button>
        <button
          type="button"
          className="tag"
          onClick={() => {
            clearTokens('edit')
            clearCachedEditPlaylists()
            setLoggedIn(false)
            setPlaylists(null)
          }}
        >
          Déconnecter
        </button>
      </div>

      {status && <p className="hint">{status}</p>}

      {!playlists && <p className="catalog-loading">Chargement des playlists…</p>}

      {playlists && (
        <div className="admin-editor">
          <ul className="admin-playlist-list">
            {filtered.map((p) => (
              <li key={p.id}>
                <button type="button" className={p.id === selectedId ? 'selected' : ''} onClick={() => select(p.id)}>
                  {p.name}
                  {!p.isPublic && <span className="badge-private">privée</span>}
                </button>
              </li>
            ))}
          </ul>

          {selectedId && (
            <form className="admin-form admin-section" onSubmit={save}>
              <label>
                Nom
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Description Spotify
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </label>
              <button type="submit">Enregistrer sur Spotify</button>
            </form>
          )}
        </div>
      )}
    </>
  )
}
