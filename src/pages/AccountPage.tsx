import { useEffect, useState } from 'react'
import { Link } from '../lib/Link'
import { FAVORITES_PATH } from '../lib/router'
import { signInWithGoogle, signOut, useAuth } from '../lib/authStore'
import { useUserLibrary } from '../lib/userLibrary'
import {
  canGoPublic,
  confirmsDeletion,
  DELETE_CONFIRMATION,
  deleteOwnAccount,
  DISPLAY_NAME_MAX,
  saveProfile,
  useProfile,
} from '../lib/profile'
import SiteMenu from './SiteMenu'
import './CatalogPage.css'

export default function AccountPage() {
  const { status, userId, email } = useAuth()
  const profile = useProfile()
  const { favoriteIds, upvotedIds } = useUserLibrary()

  const [name, setName] = useState(profile.displayName)
  const [votesPublic, setVotesPublic] = useState(profile.votesPublic)
  const [saved, setSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [typedConfirmation, setTypedConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)

  // The stored profile arrives after the first render, so the fields follow it
  // once — and only while nothing has been typed, or an edit in progress would
  // be wiped by its own load.
  useEffect(() => {
    if (profile.loading) return
    setName(profile.displayName)
    setVotesPublic(profile.votesPublic)
  }, [profile.loading, profile.displayName, profile.votesPublic])

  const nameIsUsable = canGoPublic(name)
  const dirty = name.trim() !== profile.displayName || votesPublic !== profile.votesPublic

  async function onSave() {
    if (!userId) return
    setSaved(await saveProfile(userId, { displayName: name, votesPublic }))
  }

  async function onDelete() {
    if (!confirmsDeletion(typedConfirmation)) return
    setDeleting(true)
    if (!(await deleteOwnAccount())) {
      setDeleting(false)
      return
    }
    // The row behind this token is already gone, so revoking the session can
    // fail on a user the server can no longer find. It is worth attempting —
    // it clears what is stored locally — but never worth blocking on.
    try {
      await signOut()
    } catch {
      // nothing left to do about it; the reload below is what really matters
    }
    // A full load rather than a route change: the vote counts and any open
    // list of voters are held in memory and have just been made wrong by the
    // cascade, and resetting each store by hand is one more thing to keep in
    // step with every store added later.
    window.location.href = '/'
  }

  function cancelDelete() {
    setConfirmingDelete(false)
    setTypedConfirmation('')
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
          <h1>Mon compte</h1>
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

        {status === 'signed-out' && (
          <div className="favorites-empty">
            <p>Connecte-toi pour gérer ton compte.</p>
            <button type="button" className="surprise-button" onClick={() => void signInWithGoogle()}>
              Se connecter avec Google
            </button>
          </div>
        )}

        {status === 'signed-in' && (
          <div className="account">
            <p className="account-identity">
              Connecté avec <strong>{email}</strong>
            </p>

            <section className="account-block">
              <h2>Mon pseudo</h2>
              <p className="account-note">
                Le seul pseudo que le site peut afficher. Il n’apparaît nulle part tant que tes votes restent privés.
              </p>
              <input
                type="text"
                className="account-input"
                value={name}
                maxLength={DISPLAY_NAME_MAX}
                placeholder="Comment veux-tu apparaître ?"
                onChange={(e) => {
                  setName(e.target.value)
                  setSaved(false)
                }}
                aria-label="Mon pseudo"
              />
            </section>

            <section className="account-block">
              <h2>Mes votes</h2>
              <label className="account-toggle">
                <input
                  type="checkbox"
                  checked={votesPublic}
                  disabled={!nameIsUsable}
                  onChange={(e) => {
                    setVotesPublic(e.target.checked)
                    setSaved(false)
                  }}
                />
                <span>Afficher mon pseudo à côté des playlists pour lesquelles j’ai voté</span>
              </label>
              {/* Said outright rather than discovered: it applies backwards as
                  well as forwards, and both ways round. */}
              <p className="account-note">
                Décoché, personne ne peut savoir que tu as voté — pas même moi. Coché, ton pseudo devient visible sur{' '}
                <strong>tous</strong> tes votes, y compris ceux d’avant ; le décocher les cache tous aussitôt. Le
                nombre de votes, lui, est public dans les deux cas.
              </p>
              {!nameIsUsable && <p className="account-note">Il faut d’abord choisir un pseudo.</p>}
            </section>

            <div className="account-actions">
              <button
                type="button"
                className="surprise-button"
                disabled={!dirty || profile.saving}
                onClick={() => void onSave()}
              >
                {profile.saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {saved && !dirty && <span className="account-note">Enregistré.</span>}
              {profile.error && <span className="catalog-error">{profile.error}</span>}
            </div>

            <section className="account-block">
              <h2>Mes listes</h2>
              <p className="account-note">
                {favoriteIds.size} playlist{favoriteIds.size > 1 ? 's' : ''} en favori, {upvotedIds.size} vote
                {upvotedIds.size > 1 ? 's' : ''}.{' '}
                <Link to={FAVORITES_PATH} className="account-link">
                  Voir mes favoris
                </Link>
              </p>
            </section>

            <section className="account-block danger">
              <h2>Supprimer mon compte</h2>
              <p className="account-note">
                Efface définitivement tes favoris, tes votes, ton pseudo et ton compte. Les compteurs de votes
                baissent d’autant. Rien n’est conservé et c’est irréversible.
              </p>
              {!confirmingDelete ? (
                <button type="button" className="account-danger" onClick={() => setConfirmingDelete(true)}>
                  Supprimer mon compte
                </button>
              ) : (
                <div className="account-confirm">
                  {/* Typed out rather than clicked twice: the second button of a
                      two-step confirm lands where the first one was, so a
                      double-click or a mistimed tap went through both. */}
                  <label className="account-note" htmlFor="confirm-delete">
                    Tape <strong>{DELETE_CONFIRMATION}</strong> pour confirmer.
                  </label>
                  <input
                    id="confirm-delete"
                    type="text"
                    className="account-input"
                    value={typedConfirmation}
                    autoComplete="off"
                    onChange={(e) => setTypedConfirmation(e.target.value)}
                  />
                  <div className="account-actions">
                    <button
                      type="button"
                      className="account-danger"
                      disabled={!confirmsDeletion(typedConfirmation) || deleting}
                      onClick={() => void onDelete()}
                    >
                      {deleting ? 'Suppression…' : 'Supprimer définitivement'}
                    </button>
                    <button type="button" className="surprise-button" onClick={cancelDelete}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
