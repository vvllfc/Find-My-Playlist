import { useCallback, useEffect, useState } from 'react'
import { usePlaylists } from '../lib/usePlaylists'
import { deriveTagsFromName } from '../lib/genreTaxonomy.js'
import taxonomy from '../../data/genre-taxonomy.json'
import { GithubConflictError, getFile, triggerRedeploy, updateFile } from '../lib/github'
import { GITHUB_META_PATH, SPOTIFY_CLIENT_ID } from '../config'
import { clearTokens, getStoredTokens, isLoggedIn, startLogin } from '../lib/spotifyAuth'
import { isGateConfigured, isUnlocked, lock } from '../lib/adminGate'
import PasswordGate from './PasswordGate'
import './AdminShared.css'

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
        ci-dessous : sans un token valide avec accès en écriture, aucune sauvegarde ne peut aboutir. Pour éditer tes
        playlists Spotify directement, c'est sur <code>#/modify</code>.
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
      <CiExportPanel />
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
    const trimmed = value.trim()
    setToken(trimmed)
    localStorage.setItem(GH_TOKEN_KEY, trimmed)
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

function CiExportPanel() {
  const [ciLoggedIn, setCiLoggedIn] = useState(isLoggedIn('ci-export'))
  const [ciStatus, setCiStatus] = useState<string | null>(null)

  async function copyRefreshTokenForCi() {
    const refreshToken = getStoredTokens('ci-export')?.refreshToken
    if (!refreshToken) return
    await navigator.clipboard.writeText(refreshToken)
    setCiStatus('Copié — colle-le comme secret GitHub Actions SPOTIFY_REFRESH_TOKEN.')
  }

  if (!SPOTIFY_CLIENT_ID) {
    return (
      <section className="admin-section">
        <h2>Configuration CI</h2>
        <p className="hint">
          SPOTIFY_CLIENT_ID n'est pas encore renseigné dans src/config.ts — cette section s'activera une fois l'app
          Spotify créée (voir README).
        </p>
      </section>
    )
  }

  return (
    <section className="admin-section">
      <h2>Configuration CI (une seule fois)</h2>
      <p className="hint">
        Le build automatique ne peut plus lister tes playlists publiques sans connexion (Spotify l'a bloqué). Connecte-toi
        ici en lecture seule pour générer le refresh token à coller dans le secret GitHub Actions SPOTIFY_REFRESH_TOKEN —
        ce token-là ne peut rien modifier sur ton compte, contrairement à la connexion d'édition de{' '}
        <code>#/modify</code>.
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
