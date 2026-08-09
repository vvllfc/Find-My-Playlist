import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { usePlaylists } from '../lib/usePlaylists'
import { deriveTagsFromName } from '../lib/genreTaxonomy.js'
import taxonomy from '../../data/genre-taxonomy.json'
import { GithubConflictError, getFile, triggerRedeploy, updateFile } from '../lib/github'
import { GITHUB_META_PATH, SPOTIFY_CLIENT_ID } from '../config'
import { clearTokens, ensureFreshAccessToken, getStoredTokens, isLoggedIn, startLogin } from '../lib/spotifyAuth'
import { fetchMyPlaylists, updatePlaylistDetails, type SpotifyPlaylistSummary } from '../lib/spotifyApi'
import { isGateConfigured, isUnlocked, lock, tryUnlock } from '../lib/adminGate'
import './AdminPage.css'

const GH_TOKEN_KEY = 'github_pat'

type MetaMap = Record<string, { description: string; tags: string[] }>

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(isUnlocked())

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />
  }

  return (
    <main className="admin">
      <h1>Admin</h1>
      <p className="admin-intro">
        Page privée — visible uniquement à qui a l'URL, mais protégée pour de vrai par les tokens GitHub/Spotify
        ci-dessous : sans un token valide avec accès en écriture, aucune sauvegarde ne peut aboutir.
      </p>
      {isGateConfigured() && (
        <button
          type="button"
          className="admin-lock-button"
          onClick={() => {
            lock()
            setUnlocked(false)
          }}
        >
          Verrouiller
        </button>
      )}
      <GithubMetaEditor />
      <SpotifyEditor />
    </main>
  )
}

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (await tryUnlock(password)) {
      onUnlock()
    } else {
      setError(true)
    }
  }

  return (
    <main className="admin admin-gate">
      <form onSubmit={submit}>
        <label>
          Mot de passe
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(false)
            }}
          />
        </label>
        <button type="submit">Entrer</button>
        {error && <p className="admin-conflict">Mot de passe incorrect.</p>}
      </form>
    </main>
  )
}

function GithubMetaEditor() {
  const { playlists } = usePlaylists()
  const [token, setToken] = useState(() => localStorage.getItem(GH_TOKEN_KEY) ?? '')
  const [meta, setMeta] = useState<MetaMap | null>(null)
  const [sha, setSha] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  function saveToken(value: string) {
    setToken(value)
    localStorage.setItem(GH_TOKEN_KEY, value)
  }

  const loadMeta = useCallback(async () => {
    if (!token) return
    setStatus('Chargement…')
    try {
      const file = await getFile(token, GITHUB_META_PATH)
      setMeta(JSON.parse(file.content))
      setSha(file.sha)
      setConflict(false)
      setStatus(null)
    } catch {
      setStatus('Impossible de charger data/playlists.meta.json — vérifie le token.')
    }
  }, [token])

  useEffect(() => {
    if (token) loadMeta()
  }, [token, loadMeta])

  function selectPlaylist(id: string) {
    setSelectedId(id)
    const entry = meta?.[id]
    if (entry) {
      setDescription(entry.description)
      setTagsInput(entry.tags.join(', '))
      return
    }
    const playlist = playlists?.find((p) => p.id === id)
    const suggested = playlist ? deriveTagsFromName(playlist.name, taxonomy) : []
    setDescription('')
    setTagsInput(suggested.join(', '))
  }

  async function save() {
    if (!token || !meta || !sha || !selectedId) return
    const updatedMeta: MetaMap = {
      ...meta,
      [selectedId]: {
        description: description.trim(),
        tags: tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      },
    }
    setStatus('Enregistrement…')
    try {
      await updateFile(token, GITHUB_META_PATH, JSON.stringify(updatedMeta, null, 2), sha, `Update metadata for ${selectedId}`)
      setStatus('Enregistré — un rebuild du site vient de se déclencher automatiquement.')
      await loadMeta()
    } catch (err) {
      if (err instanceof GithubConflictError) {
        setConflict(true)
        setStatus('Conflit : le fichier a changé depuis ton dernier chargement.')
      } else {
        setStatus("Échec de l'enregistrement — vérifie que le token a la permission Contents: Read and write.")
      }
    }
  }

  async function refreshNow() {
    if (!token) return
    setStatus('Déclenchement du redéploiement…')
    try {
      await triggerRedeploy(token)
      setStatus('Redéploiement déclenché — le site sera à jour dans quelques minutes.')
    } catch {
      setStatus('Échec du déclenchement — vérifie que le token a la permission Actions: Read and write.')
    }
  }

  const selectedPlaylist = playlists?.find((p) => p.id === selectedId)
  const hasEntry = selectedId ? Boolean(meta?.[selectedId]) : false

  return (
    <section className="admin-section">
      <h2>Descriptions &amp; tags du site</h2>
      <label className="admin-field">
        Token GitHub (fine-grained, Contents + Actions: Read and write, scopé à ce repo)
        <input type="password" value={token} onChange={(e) => saveToken(e.target.value)} placeholder="github_pat_…" />
      </label>

      {token && (
        <div className="admin-toolbar">
          <button type="button" onClick={loadMeta}>
            Recharger
          </button>
          <button type="button" onClick={refreshNow}>
            Rafraîchir le site maintenant
          </button>
          <button
            type="button"
            onClick={() => {
              setToken('')
              localStorage.removeItem(GH_TOKEN_KEY)
              setMeta(null)
            }}
          >
            Déconnecter
          </button>
        </div>
      )}

      {status && <p className="admin-status">{status}</p>}

      {token && playlists && meta && (
        <div className="admin-editor">
          <ul className="admin-playlist-list">
            {playlists.map((p) => (
              <li key={p.id}>
                <button type="button" className={p.id === selectedId ? 'selected' : ''} onClick={() => selectPlaylist(p.id)}>
                  {p.name}
                  {!meta[p.id] && <span className="badge-new">non décrite</span>}
                </button>
              </li>
            ))}
          </ul>

          {selectedPlaylist && (
            <form
              className="admin-form"
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              <h3>{selectedPlaylist.name}</h3>
              {!hasEntry && <p className="hint">Pas encore décrite — tags suggérés pré-remplis, à valider.</p>}
              <label>
                Description
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </label>
              <label>
                Tags (séparés par des virgules)
                <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
              </label>
              {conflict && (
                <p className="admin-conflict">
                  Le fichier a changé depuis ton dernier chargement.{' '}
                  <button type="button" onClick={loadMeta}>
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

function SpotifyEditor() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn('edit'))
  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [ciLoggedIn, setCiLoggedIn] = useState(isLoggedIn('ci-export'))
  const [ciStatus, setCiStatus] = useState<string | null>(null)

  async function copyRefreshTokenForCi() {
    const refreshToken = getStoredTokens('ci-export')?.refreshToken
    if (!refreshToken) return
    await navigator.clipboard.writeText(refreshToken)
    setCiStatus('Copié — colle-le comme secret GitHub Actions SPOTIFY_REFRESH_TOKEN.')
  }

  const load = useCallback(async () => {
    const token = await ensureFreshAccessToken('edit')
    if (!token) {
      setLoggedIn(false)
      return
    }
    setStatus('Chargement des playlists Spotify…')
    try {
      setPlaylists(await fetchMyPlaylists(token))
      setStatus(null)
    } catch {
      setStatus('Impossible de charger tes playlists Spotify.')
    }
  }, [])

  useEffect(() => {
    if (loggedIn) load()
  }, [loggedIn, load])

  function select(id: string) {
    setSelectedId(id)
    const playlist = playlists?.find((p) => p.id === id)
    setName(playlist?.name ?? '')
    setDescription(playlist?.description ?? '')
  }

  async function save() {
    if (!selectedId) return
    const token = await ensureFreshAccessToken('edit')
    if (!token) {
      setLoggedIn(false)
      return
    }
    setStatus('Enregistrement sur Spotify…')
    try {
      await updatePlaylistDetails(token, selectedId, { name, description })
      setStatus('Enregistré sur Spotify. Pense à "Rafraîchir le site maintenant" ci-dessus pour resynchroniser le site.')
      await load()
    } catch {
      setStatus("Échec de l'enregistrement sur Spotify.")
    }
  }

  if (!SPOTIFY_CLIENT_ID) {
    return (
      <section className="admin-section">
        <h2>Édition directe Spotify</h2>
        <p className="hint">
          SPOTIFY_CLIENT_ID n'est pas encore renseigné dans src/config.ts — cette section s'activera une fois l'app
          Spotify créée (voir README).
        </p>
      </section>
    )
  }

  return (
    <section className="admin-section">
      <h2>Édition directe Spotify (nom + description)</h2>
      {!loggedIn && (
        <button type="button" onClick={() => startLogin('edit')}>
          Connecter Spotify
        </button>
      )}

      {loggedIn && (
        <>
          <div className="admin-toolbar">
            <button
              type="button"
              onClick={() => {
                clearTokens('edit')
                setLoggedIn(false)
                setPlaylists(null)
              }}
            >
              Déconnecter Spotify
            </button>
          </div>

          {status && <p className="admin-status">{status}</p>}

          {playlists && (
            <div className="admin-editor">
              <ul className="admin-playlist-list">
                {playlists.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={p.id === selectedId ? 'selected' : ''} onClick={() => select(p.id)}>
                      {p.name}
                      {!p.isPublic && <span className="badge-private">privée</span>}
                    </button>
                  </li>
                ))}
              </ul>

              {selectedId && (
                <form
                  className="admin-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    save()
                  }}
                >
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
      )}

      <hr />
      <h3>Configuration CI (une seule fois)</h3>
      <p className="hint">
        Le build automatique ne peut plus lister tes playlists publiques sans connexion (Spotify l'a bloqué). Connecte-toi
        ici en lecture seule pour générer le refresh token à coller dans le secret GitHub Actions SPOTIFY_REFRESH_TOKEN —
        ce token-là ne peut rien modifier sur ton compte, contrairement à celui de la connexion d'édition ci-dessus.
      </p>
      {!ciLoggedIn && (
        <button type="button" onClick={() => startLogin('ci-export')}>
          Connecter Spotify (lecture seule, pour CI)
        </button>
      )}
      {ciLoggedIn && (
        <div className="admin-toolbar">
          <button type="button" onClick={copyRefreshTokenForCi}>
            Copier le refresh token
          </button>
          <button
            type="button"
            onClick={() => {
              clearTokens('ci-export')
              setCiLoggedIn(false)
              setCiStatus(null)
            }}
          >
            Déconnecter
          </button>
        </div>
      )}
      {ciStatus && <p className="admin-status">{ciStatus}</p>}
    </section>
  )
}
