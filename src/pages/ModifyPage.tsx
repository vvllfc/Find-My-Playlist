import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useCatalog } from '../lib/useCatalog'
import { buildFolderTree, listAllFolders, type Folder } from '../lib/catalog'
import { GITHUB_TOKEN_STORAGE_KEY, SPOTIFY_CLIENT_ID } from '../config'
import { clearTokens, ensureFreshAccessToken, isLoggedIn, startLogin } from '../lib/spotifyAuth'
import { fetchMyPlaylists, fetchPlaylistDetails, updatePlaylistDetails } from '../lib/spotifyApi'
import { GithubConflictError, triggerRedeploy } from '../lib/github'
import { loadSiteContent, saveSiteContent, type LoadedSiteContent } from '../lib/siteContent'
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
          <h1>Modifier le catalogue</h1>
          <p>Dossiers du site et playlists Spotify — chaque sauvegarde met à jour le site public automatiquement.</p>
        </div>
      </div>
      <main className="catalog">
        <FolderContentEditor />
        <SpotifyDirectEditor />
      </main>
    </div>
  )
}

// Edits the hand-written part of the public catalog (data/site-content.json,
// folder descriptions today — future editable site content belongs here too).
// GitHub-backed and independent of the Spotify login below: the save commit
// itself triggers the deploy workflow, so the public page follows on its own.
function FolderContentEditor() {
  const { catalog } = useCatalog()
  const [token, setToken] = useState(() => localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) ?? '')
  const [loaded, setLoaded] = useState<LoadedSiteContent | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  const folders = useMemo(() => listAllFolders(buildFolderTree(catalog?.playlists ?? [])), [catalog])

  function saveToken(value: string) {
    const trimmed = value.trim()
    setToken(trimmed)
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, trimmed)
  }

  const load = useCallback(async () => {
    if (!token) return
    setStatus('Chargement…')
    try {
      setLoaded(await loadSiteContent(token))
      setConflict(false)
      setStatus(null)
    } catch {
      setStatus('Impossible de charger le contenu du site — vérifie le token GitHub.')
    }
  }, [token])

  useEffect(() => {
    if (token) load()
  }, [token, load])

  function select(folder: Folder) {
    setSelectedKey(folder.key)
    setDescription(loaded?.content.folders[folder.key]?.description ?? '')
    setStatus(null)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!token || !loaded || !selectedKey) return
    const content = {
      ...loaded.content,
      folders: { ...loaded.content.folders, [selectedKey]: { description: description.trim() } },
    }
    setStatus('Enregistrement…')
    try {
      await saveSiteContent(token, content, loaded.sha, 'Update folder descriptions')
      setStatus('Enregistré — le site public se met à jour automatiquement (quelques minutes).')
      await load()
    } catch (err) {
      if (err instanceof GithubConflictError) {
        setConflict(true)
        setStatus('Conflit : le fichier a changé depuis ton dernier chargement.')
      } else {
        setStatus("Échec de l'enregistrement — vérifie que le token a la permission Contents: Read and write.")
      }
    }
  }

  const selected = folders.find((f) => f.key === selectedKey) ?? null

  return (
    <section className="admin-section">
      <h2>Dossiers du catalogue</h2>
      {!token && (
        <label className="admin-field">
          Token GitHub (fine-grained, Contents + Actions: Read and write, scopé à ce repo)
          <input type="password" value={token} onChange={(e) => saveToken(e.target.value)} placeholder="github_pat_…" />
        </label>
      )}
      {status && <p className="admin-status">{status}</p>}
      {token && loaded && (
        <div className="admin-editor">
          <ul className="admin-playlist-list">
            {folders.map((folder) => (
              <li key={folder.key}>
                <button
                  type="button"
                  className={folder.key === selectedKey ? 'selected' : ''}
                  onClick={() => select(folder)}
                >
                  {folder.key.includes('/') ? `↳ ${folder.name}` : folder.name}
                  {!loaded.content.folders[folder.key]?.description && <span className="badge-new">sans description</span>}
                </button>
              </li>
            ))}
          </ul>

          {selected && (
            <form className="admin-form" onSubmit={save}>
              <h3>{selected.key}</h3>
              <label>
                Description du dossier (affichée sur la page publique)
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </label>
              {conflict && (
                <p className="admin-conflict">
                  Le fichier a changé depuis ton dernier chargement.{' '}
                  <button type="button" onClick={load}>
                    Recharger la dernière version
                  </button>
                </p>
              )}
              <button type="submit">Enregistrer</button>
            </form>
          )}
        </div>
      )}
    </section>
  )
}

function SpotifyDirectEditor() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn('edit'))

  // Public list: the exact same static JSON the public catalog reads — iso
  // by construction, and free (no Spotify call at all just to browse it).
  const { catalog } = useCatalog()
  const publicPlaylists = catalog?.playlists ?? null

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
        setFormStatus('Enregistré sur Spotify.')
        return
      }

      // Public playlists are shown on the live site — reuse the GitHub token
      // already saved (here or sur #/admin) to trigger a rebuild automatically,
      // so a save here really does update both Spotify and the site without
      // a separate manual step.
      const githubToken = localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY)
      if (!githubToken) {
        setFormStatus(
          'Enregistré sur Spotify. Renseigne un token GitHub (section Dossiers ci-dessus) pour que le site se mette à jour automatiquement.',
        )
        return
      }
      try {
        await triggerRedeploy(githubToken)
        setFormStatus('Enregistré sur Spotify — le site se met à jour automatiquement, ce sera visible dans quelques minutes.')
      } catch {
        setFormStatus(
          'Enregistré sur Spotify, mais le déclenchement automatique du site a échoué — utilise "Rafraîchir le site maintenant" sur #/admin.',
        )
      }
    } catch {
      setFormStatus("Échec de l'enregistrement sur Spotify.")
    }
  }

  if (!SPOTIFY_CLIENT_ID) {
    return <p className="hint">SPOTIFY_CLIENT_ID n'est pas encore renseigné dans src/config.ts.</p>
  }

  if (!loggedIn) {
    return (
      <section className="admin-section">
        <h2>Playlists Spotify</h2>
        <button type="button" className="tag active" onClick={() => startLogin('edit')}>
          Connecter Spotify
        </button>
      </section>
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
