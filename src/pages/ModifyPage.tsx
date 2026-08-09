import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { usePlaylists } from '../lib/usePlaylists'
import { SPOTIFY_CLIENT_ID } from '../config'
import { clearTokens, ensureFreshAccessToken, isLoggedIn, startLogin } from '../lib/spotifyAuth'
import { fetchMyPlaylists, fetchPlaylistDetails, updatePlaylistDetails } from '../lib/spotifyApi'
import { clearCachedEditPlaylists, getCachedEditPlaylists, setCachedEditPlaylists, updateCachedEditPlaylist } from '../lib/editPlaylistsCache'
import { isUnlocked } from '../lib/adminGate'
import PasswordGate from './PasswordGate'
import './CatalogPage.css'
import './AdminShared.css'

type Source = 'public' | 'private'

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

  // Public list: the exact same static JSON the public catalog reads — iso
  // by construction, and free (no Spotify call at all just to browse it).
  const { playlists: publicPlaylists } = usePlaylists()

  // Private list: Spotify has no way to filter the list endpoint by
  // public/private, so this still has to paginate the full /v1/me/playlists,
  // but only on an explicit refresh (cached in localStorage otherwise) and
  // only the private half is kept — the public half already came for free
  // above.
  const [privatePlaylists, setPrivatePlaylists] = useState(() => getCachedEditPlaylists()?.filter((p) => !p.isPublic) ?? null)
  const [privateLoading, setPrivateLoading] = useState(false)
  const [privateStatus, setPrivateStatus] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ source: Source; id: string; name: string } | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [formStatus, setFormStatus] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const refreshPrivateList = useCallback(async () => {
    const token = await ensureFreshAccessToken('edit')
    if (!token) {
      setLoggedIn(false)
      return
    }
    setPrivateLoading(true)
    setPrivateStatus('Chargement des playlists Spotify…')
    try {
      const all = await fetchMyPlaylists(token)
      setCachedEditPlaylists(all)
      setPrivatePlaylists(all.filter((p) => !p.isPublic))
      setPrivateStatus(null)
    } catch {
      setPrivateStatus('Impossible de charger tes playlists Spotify.')
    } finally {
      setPrivateLoading(false)
    }
  }, [])

  // Only fetch automatically when logged in with nothing cached yet — the
  // very first time on this device/browser. Otherwise reuse the cache and
  // wait for an explicit "Rafraîchir la liste" click.
  useEffect(() => {
    if (loggedIn && !getCachedEditPlaylists()) refreshPrivateList()
  }, [loggedIn, refreshPrivateList])

  const filteredPublic = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = publicPlaylists ?? []
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list
  }, [publicPlaylists, query])

  const filteredPrivate = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = privatePlaylists ?? []
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list
  }, [privatePlaylists, query])

  async function selectPublic(id: string, currentName: string) {
    setSelected({ source: 'public', id, name: currentName })
    const token = await ensureFreshAccessToken('edit')
    if (!token) {
      setLoggedIn(false)
      return
    }
    setFormLoading(true)
    setFormStatus('Chargement du contenu Spotify actuel…')
    try {
      const details = await fetchPlaylistDetails(token, id)
      setName(details.name)
      setDescription(details.description)
      setFormStatus(null)
    } catch {
      setFormStatus('Impossible de charger le contenu Spotify de cette playlist.')
    } finally {
      setFormLoading(false)
    }
  }

  function selectPrivate(id: string) {
    const playlist = privatePlaylists?.find((p) => p.id === id)
    setSelected({ source: 'private', id, name: playlist?.name ?? '' })
    setName(playlist?.name ?? '')
    setDescription(playlist?.description ?? '')
    setFormStatus(null)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    const token = await ensureFreshAccessToken('edit')
    if (!token) {
      setLoggedIn(false)
      return
    }
    setFormStatus('Enregistrement sur Spotify…')
    try {
      await updatePlaylistDetails(token, selected.id, { name, description })
      if (selected.source === 'private') {
        updateCachedEditPlaylist(selected.id, { name, description })
        setPrivatePlaylists(getCachedEditPlaylists()?.filter((p) => !p.isPublic) ?? null)
      }
      setFormStatus(
        selected.source === 'public'
          ? 'Enregistré sur Spotify. Pense à "Rafraîchir le site maintenant" sur #/admin pour que le site public reprenne le nouveau nom.'
          : 'Enregistré sur Spotify.',
      )
    } catch {
      setFormStatus("Échec de l'enregistrement sur Spotify.")
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
        <button type="button" className="tag" onClick={refreshPrivateList} disabled={privateLoading}>
          Rafraîchir la liste (privées)
        </button>
        <button
          type="button"
          className="tag"
          onClick={() => {
            clearTokens('edit')
            clearCachedEditPlaylists()
            setLoggedIn(false)
            setPrivatePlaylists(null)
            setSelected(null)
          }}
        >
          Déconnecter
        </button>
      </div>

      <section className="admin-section">
        <h2>Playlists publiques</h2>
        {!publicPlaylists && <p className="catalog-loading">Chargement…</p>}
        {publicPlaylists && (
          <ul className="admin-playlist-list">
            {filteredPublic.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={selected?.source === 'public' && selected.id === p.id ? 'selected' : ''}
                  onClick={() => selectPublic(p.id, p.name)}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-section">
        <h2>Playlists privées</h2>
        {privateStatus && <p className="hint">{privateStatus}</p>}
        {!privatePlaylists && !privateStatus && <p className="catalog-loading">Chargement…</p>}
        {privatePlaylists && (
          <ul className="admin-playlist-list">
            {filteredPrivate.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={selected?.source === 'private' && selected.id === p.id ? 'selected' : ''}
                  onClick={() => selectPrivate(p.id)}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <form className="admin-form admin-section" onSubmit={save}>
          <h3>{selected.name}</h3>
          {formLoading && <p className="hint">Chargement…</p>}
          <label>
            Nom
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Description Spotify
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
          {formStatus && <p className="hint">{formStatus}</p>}
          <button type="submit">Enregistrer sur Spotify</button>
        </form>
      )}
    </>
  )
}
