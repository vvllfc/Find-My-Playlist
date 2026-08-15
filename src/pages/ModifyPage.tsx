import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useCatalog } from '../lib/useCatalog'
import { buildFolderTree, listAllFolders, listAllTags, type Folder } from '../lib/catalog'
import { SPOTIFY_CLIENT_ID } from '../config'
import { clearTokens, ensureFreshAccessToken, isLoggedIn, startLogin } from '../lib/spotifyAuth'
import { fetchMyPlaylists, fetchPlaylistName, renamePlaylist } from '../lib/spotifyApi'
import {
  useSiteContentStore,
  withPlaylistMeta,
  withTagMeta,
  type PlaylistMeta,
  type SiteContentStore,
} from '../lib/siteContent'
import { clearCachedEditPlaylists, getCachedEditPlaylists, setCachedEditPlaylists, updateCachedEditPlaylist } from '../lib/editPlaylistsCache'
import { isUnlocked } from '../lib/adminGate'
import PasswordGate from './PasswordGate'
import './CatalogPage.css'
import './AdminShared.css'

type Source = 'public' | 'private'

export default function ModifyPage() {
  const [unlocked, setUnlocked] = useState(isUnlocked())
  // One store for the whole page: the folder editor and the playlist editor
  // both write to the same file, so they have to share a version of it.
  const store = useSiteContentStore()

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />
  }

  return (
    <div className="catalog-page">
      <div className="hero-zone">
        <div className="hero-inner">
          <p className="kicker">VLF Music</p>
          <h1>Modifier le catalogue</h1>
          <p>
            Descriptions du site et noms Spotify — chaque sauvegarde met à jour le site public
            automatiquement.
          </p>
        </div>
      </div>
      <main className="catalog">
        {!store.token && (
          <section className="admin-section">
            <label className="admin-field">
              Token GitHub (fine-grained, Contents + Actions: Read and write, scopé à ce repo)
              <input
                type="password"
                value={store.token}
                onChange={(e) => store.setToken(e.target.value)}
                placeholder="github_pat_…"
              />
            </label>
          </section>
        )}
        {store.status && <p className="admin-status">{store.status}</p>}
        <FolderContentEditor store={store} />
        <TagGlossaryEditor store={store} />
        <PlaylistEditor store={store} />
      </main>
    </div>
  )
}

// Folder blurbs shown on the public tiles and folder headers. GitHub-backed
// and independent of the Spotify login below: the save commit itself triggers
// the deploy, so the public page follows on its own.
function FolderContentEditor({ store }: { store: SiteContentStore }) {
  const { catalog } = useCatalog()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [description, setDescription] = useState('')

  const folders = useMemo(() => listAllFolders(buildFolderTree(catalog?.playlists ?? [])), [catalog])

  function select(folder: Folder) {
    setSelectedKey(folder.key)
    setDescription(store.loaded?.content.folders[folder.key]?.description ?? '')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!selectedKey) return
    await store.save(
      (content) => ({
        ...content,
        folders: { ...content.folders, [selectedKey]: { description: description.trim() } },
      }),
      'Update folder descriptions',
    )
  }

  const selected = folders.find((f) => f.key === selectedKey) ?? null

  return (
    <section className="admin-section">
      <h2>Dossiers du catalogue</h2>
      {store.token && store.loaded && (
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
                  {!store.loaded?.content.folders[folder.key]?.description && (
                    <span className="badge-new">sans description</span>
                  )}
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
              {store.conflict && (
                <p className="admin-conflict">
                  Le fichier a changé depuis ton dernier chargement.{' '}
                  <button type="button" onClick={store.reload}>
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

// What each tag means, shown on the public Glossary page. Same shape as the
// folder editor above — one list, one field — because it's the same job: a
// short piece of hand-written text keyed by something the catalog already has.
function TagGlossaryEditor({ store }: { store: SiteContentStore }) {
  const { catalog } = useCatalog()
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [description, setDescription] = useState('')

  const tags = useMemo(() => (catalog ? listAllTags(catalog) : []), [catalog])

  function select(tag: string) {
    setSelectedTag(tag)
    setDescription(store.loaded?.content.tags[tag]?.description ?? '')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!selectedTag) return
    await store.save(
      (content) => withTagMeta(content, selectedTag, { description: description.trim() }),
      'Update tag glossary',
    )
  }

  const written = tags.filter((entry) => store.loaded?.content.tags[entry.tag]?.description).length

  return (
    <section className="admin-section">
      <h2>Glossaire des tags</h2>
      {store.token && store.loaded && (
        <>
          <p className="hint">
            {written} / {tags.length} tags définis. Vider le champ retire la définition.
          </p>
          <div className="admin-editor">
            <ul className="admin-playlist-list">
              {tags.map((entry) => (
                <li key={entry.tag}>
                  <button
                    type="button"
                    className={entry.tag === selectedTag ? 'selected' : ''}
                    onClick={() => select(entry.tag)}
                  >
                    {entry.isGenre ? entry.tag : `↳ ${entry.tag}`}
                    {!store.loaded?.content.tags[entry.tag]?.description && (
                      <span className="badge-new">{entry.count}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {selectedTag && (
              <form className="admin-form" onSubmit={save}>
                <h3>{selectedTag}</h3>
                <label>
                  Définition du tag (affichée sur la page Glossaire)
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                </label>
                {store.conflict && (
                  <p className="admin-conflict">
                    Le fichier a changé depuis ton dernier chargement.{' '}
                    <button type="button" onClick={store.reload}>
                      Recharger la dernière version
                    </button>
                  </p>
                )}
                <button type="submit">Enregistrer</button>
              </form>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// One form per playlist covering both halves of what can be edited: the
// description shown on the site (hand-written, committed here) and the name
// on Spotify itself (so naming can be harmonised without leaving the page).
// Each destination is only written when its field actually changed, which
// keeps Spotify calls down to the ones that mean something.
function PlaylistEditor({ store }: { store: SiteContentStore }) {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn('edit'))

  // Public list: the exact same static JSON the public catalog reads — iso by
  // construction, and free (no Spotify call at all just to browse it).
  const { catalog } = useCatalog()
  const publicPlaylists = catalog?.playlists ?? null

  // Private list: Spotify has no way to filter the list endpoint by
  // public/private, so this still has to paginate the full /v1/me/playlists,
  // but only on an explicit refresh (cached in localStorage otherwise).
  const [privatePlaylists, setPrivatePlaylists] = useState(() => getCachedEditPlaylists()?.filter((p) => !p.isPublic) ?? null)
  const [privateLoading, setPrivateLoading] = useState(false)
  const [privateStatus, setPrivateStatus] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ source: Source; id: string } | null>(null)
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [description, setDescription] = useState('')
  const [savedDescription, setSavedDescription] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [savedFavorite, setSavedFavorite] = useState(false)
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

  // Only fetch automatically when logged in with nothing cached yet — the very
  // first time on this device. Otherwise reuse the cache.
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

  function startEditing(source: Source, id: string, currentName: string, siteDescription: string, isFavorite: boolean) {
    setSelected({ source, id })
    setName(currentName)
    setSavedName(currentName)
    setDescription(siteDescription)
    setSavedDescription(siteDescription)
    setFavorite(isFavorite)
    setSavedFavorite(isFavorite)
    setFormStatus(null)
  }

  async function selectPublic(id: string, listName: string) {
    const meta = store.loaded?.content.playlists[id]
    startEditing('public', id, listName, meta?.description ?? '', meta?.favorite === true)

    // The static JSON is a snapshot from the last build; the name may have
    // moved on Spotify since, so confirm it before offering it for editing.
    const token = await ensureFreshAccessToken('edit')
    if (!token) {
      setLoggedIn(false)
      return
    }
    setFormLoading(true)
    try {
      const current = await fetchPlaylistName(token, id)
      setName(current)
      setSavedName(current)
    } catch {
      setFormStatus('Impossible de lire le nom actuel sur Spotify — celui affiché vient du dernier build.')
    } finally {
      setFormLoading(false)
    }
  }

  function selectPrivate(id: string) {
    const playlist = privatePlaylists?.find((p) => p.id === id)
    startEditing('private', id, playlist?.name ?? '', '', false)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!selected) return

    const nameChanged = name.trim() !== savedName.trim()
    const descriptionChanged = selected.source === 'public' && description.trim() !== savedDescription.trim()
    const favoriteChanged = selected.source === 'public' && favorite !== savedFavorite
    if (!nameChanged && !descriptionChanged && !favoriteChanged) {
      setFormStatus('Rien à enregistrer.')
      return
    }

    if (nameChanged) {
      const token = await ensureFreshAccessToken('edit')
      if (!token) {
        setLoggedIn(false)
        return
      }
      setFormStatus('Renommage sur Spotify…')
      try {
        await renamePlaylist(token, selected.id, name.trim())
        setSavedName(name.trim())
        if (selected.source === 'private') {
          updateCachedEditPlaylist(selected.id, { name: name.trim() })
          setPrivatePlaylists(getCachedEditPlaylists()?.filter((p) => !p.isPublic) ?? null)
        }
      } catch {
        setFormStatus('Échec du renommage sur Spotify.')
        return
      }
    }

    // Both live in the same file, so they go in one commit rather than two.
    if (descriptionChanged || favoriteChanged) {
      const id = selected.id
      const patch: PlaylistMeta = {}
      if (descriptionChanged) patch.description = description.trim()
      // Undefined rather than false so unmarking drops the key entirely
      // instead of leaving a "favorite": false behind on every playlist.
      if (favoriteChanged) patch.favorite = favorite || undefined
      await store.save((content) => withPlaylistMeta(content, id, patch), 'Update playlist content')
      setSavedDescription(description.trim())
      setSavedFavorite(favorite)
      return
    }

    setFormStatus(
      selected.source === 'public'
        ? 'Renommée sur Spotify. Le site reprendra le nouveau nom au prochain build.'
        : 'Renommée sur Spotify.',
    )
  }

  if (!SPOTIFY_CLIENT_ID) {
    return <p className="hint">SPOTIFY_CLIENT_ID n'est pas encore renseigné dans src/config.ts.</p>
  }

  const selectedPublic = selected?.source === 'public'
  const selectedName = selected
    ? (selectedPublic ? publicPlaylists : privatePlaylists)?.find((p) => p.id === selected.id)?.name
    : null

  return (
    <>
      <section className="admin-section">
        <h2>Playlists</h2>
        <p className="hint">
          La description affichée sur le site est écrite ici — elle ne vient plus de Spotify. Le nom, lui,
          est modifié directement sur Spotify.
        </p>
        {!loggedIn && (
          <button type="button" className="tag active" onClick={() => startLogin('edit')}>
            Connecter Spotify
          </button>
        )}
      </section>

      {loggedIn && (
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
                      className={selectedPublic && selected?.id === p.id ? 'selected' : ''}
                      onClick={() => selectPublic(p.id, p.name)}
                    >
                      {store.loaded?.content.playlists[p.id]?.favorite && (
                        <span className="badge-favorite" aria-label="Coup de cœur">
                          ♥
                        </span>
                      )}
                      {p.name}
                      {!store.loaded?.content.playlists[p.id]?.description && (
                        <span className="badge-new">sans description</span>
                      )}
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
              <h3>{selectedName ?? savedName}</h3>
              {formLoading && <p className="hint">Lecture du nom actuel sur Spotify…</p>}
              <label>
                Nom (modifié sur Spotify)
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              {selectedPublic ? (
                <>
                  <label>
                    Description du site (affichée sur la page publique)
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                  </label>
                  <label className="admin-toggle">
                    <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
                    Coup de cœur — encadrée en violet sur le site public
                  </label>
                </>
              ) : (
                <p className="hint">Playlist privée : elle n'apparaît pas sur le site public, donc pas de description.</p>
              )}
              {formStatus && <p className="hint">{formStatus}</p>}
              <button type="submit">Enregistrer</button>
            </form>
          )}
        </>
      )}
    </>
  )
}
