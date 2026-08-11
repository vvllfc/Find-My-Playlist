import { useState } from 'react'
import { useCatalog } from '../lib/useCatalog'
import { deriveTagsFromName } from '../lib/genreTaxonomy.js'
import taxonomy from '../../data/genre-taxonomy.json'
import { triggerRedeploy } from '../lib/github'
import { useSiteContentStore, withPlaylistMeta } from '../lib/siteContent'
import { SPOTIFY_CLIENT_ID } from '../config'
import { clearTokens, getStoredTokens, isLoggedIn, startLogin } from '../lib/spotifyAuth'
import { isGateConfigured, isUnlocked, lock } from '../lib/adminGate'
import PasswordGate from './PasswordGate'
import './AdminShared.css'

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
        playlists Spotify et les dossiers du catalogue, c'est sur <code>#/modify</code>.
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
      <GithubTagsEditor />
      <CiExportPanel />
    </main>
  )
}

function GithubTagsEditor() {
  const { catalog } = useCatalog()
  const playlists = catalog?.playlists ?? null
  const store = useSiteContentStore()
  const { token, setToken, loaded, status, conflict } = store
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tagsInput, setTagsInput] = useState('')
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null)

  function selectPlaylist(id: string) {
    setSelectedId(id)
    const entry = loaded?.content.playlists[id]
    if (entry?.tags) {
      setTagsInput(entry.tags.join(', '))
      return
    }
    const playlist = playlists?.find((p) => p.id === id)
    const suggested = playlist ? deriveTagsFromName(playlist.name, taxonomy) : []
    setTagsInput(suggested.join(', '))
  }

  async function save() {
    if (!selectedId) return
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    // Merged into the entry, never replacing it: the same key also holds the
    // playlist's site description, edited on the other private page.
    await store.save((content) => withPlaylistMeta(content, selectedId, { tags }), `Update tags for ${selectedId}`)
  }

  async function refreshNow() {
    if (!token) return
    setDispatchStatus('Déclenchement du redéploiement…')
    try {
      await triggerRedeploy(token)
      setDispatchStatus('Redéploiement déclenché — le site sera à jour dans quelques minutes.')
    } catch {
      setDispatchStatus('Échec du déclenchement — vérifie que le token a la permission Actions: Read and write.')
    }
  }

  const selectedPlaylist = playlists?.find((p) => p.id === selectedId)
  const hasEntry = selectedId ? Boolean(loaded?.content.playlists[selectedId]?.tags) : false

  return (
    <section className="admin-section">
      <h2>Tags du site</h2>
      <p className="hint">
        Les descriptions des playlists et des dossiers s'écrivent sur <code>#/modify</code> — seuls les tags
        sont gérés ici, à la main.
      </p>
      <label className="admin-field">
        Token GitHub (fine-grained, Contents + Actions: Read and write, scopé à ce repo)
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" />
      </label>

      {token && (
        <div className="admin-toolbar">
          <button type="button" onClick={store.reload}>
            Recharger
          </button>
          <button type="button" onClick={refreshNow}>
            Rafraîchir le site maintenant
          </button>
          <button type="button" onClick={() => setToken('')}>
            Déconnecter
          </button>
        </div>
      )}

      {status && <p className="admin-status">{status}</p>}
      {dispatchStatus && <p className="admin-status">{dispatchStatus}</p>}

      {token && playlists && loaded && (
        <div className="admin-editor">
          <ul className="admin-playlist-list">
            {playlists.map((p) => (
              <li key={p.id}>
                <button type="button" className={p.id === selectedId ? 'selected' : ''} onClick={() => selectPlaylist(p.id)}>
                  {p.name}
                  {!loaded.content.playlists[p.id]?.tags && <span className="badge-new">tags auto</span>}
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
              {!hasEntry && <p className="hint">Tags dérivés du nom pré-remplis — enregistrer les fige à la main.</p>}
              <label>
                Tags (séparés par des virgules)
                <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
              </label>
              {conflict && (
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
