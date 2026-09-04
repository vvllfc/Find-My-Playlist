import { useEffect, useState } from 'react'
import { Link } from '../lib/Link'
import { ACCOUNT_PATH, replaceLocation } from '../lib/router'
import {
  completeGoogleSignIn,
  defaultReturnTo,
  forgetReturnTo,
  getAuthState,
  signInWithGoogle,
  useAuth,
} from '../lib/authStore'
import { forgetPendingAction } from '../lib/userLibrary'
import SiteMenu from './SiteMenu'
import './CatalogPage.css'

// Google's own mark. Its brand guidelines ask for this and not a generic icon,
// and a person is far likelier to trust a button that looks like the screen it
// is about to open.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

/**
 * One path, two jobs.
 *
 * /connexion is both the page a visitor is sent to when something needs an
 * account and the URL Google returns to. They are deliberately the same:
 * Supabase only ever redirects to paths declared up front in its dashboard, so
 * folding the visible page onto the landing path leaves nothing new to declare
 * there, and nothing to keep in step if either one ever moves.
 *
 * What tells the two apart is the query string, never the path — a return from
 * Google carries ?code= or ?error=, a visitor arriving to sign in carries
 * nothing. It is read once at mount because the exchange strips the query as
 * part of running, and a second read would find a page that had lost its own
 * reason for being there.
 */
export default function SignInPage() {
  const { status } = useAuth()
  const [returning] = useState(() => /[?&](code|error)=/.test(window.location.search))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!returning) return
    completeGoogleSignIn().then(({ returnTo, error }) => {
      if (error) {
        setError(error)
        return
      }
      // replaceLocation rather than navigate: the URL being left carries the
      // authorization code, and stepping back onto it would replay an exchange
      // that is bound to fail.
      replaceLocation(returnTo)
    })
  }, [returning])

  // Someone already signed in has nothing to do here — most often they got
  // here from the menu, whose entry points at the account page as soon as the
  // session is known. Replace rather than push, so Back doesn't bounce them
  // between the two.
  useEffect(() => {
    if (returning || status !== 'signed-in') return
    replaceLocation(ACCOUNT_PATH)
  }, [returning, status])

  // Where to come back to when nothing more specific was recorded on the way
  // here: someone who opened the menu is asking for their account, not for the
  // page they happened to be reading.
  useEffect(() => {
    if (returning) return
    defaultReturnTo(ACCOUNT_PATH)
  }, [returning])

  // A vote or a bookmark clicked while signed out waits in session storage to
  // be applied on the way back. Someone who thinks better of it and leaves
  // without signing in must not have it fire later, on a sign-in started for
  // another reason entirely — so leaving this page in-app forgets both it and
  // the return path. Going to Google is a document navigation and runs no
  // cleanup at all, which is exactly the difference being relied on here.
  useEffect(() => {
    return () => {
      if (getAuthState().status === 'signed-in') return
      forgetPendingAction()
      forgetReturnTo()
    }
  }, [])

  const heading = returning ? (error ? 'Connexion interrompue' : 'Connexion en cours…') : 'Se connecter'

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
          <h1>{heading}</h1>
        </div>
      </div>

      <main className="catalog">
        <Link to="/" className="back-link">
          <span className="back-arrow" aria-hidden="true">
            ←
          </span>
          Retour au catalogue
        </Link>

        {returning && !error && (
          <div className="signin-pending" role="status" aria-label="Connexion en cours">
            <span />
            <span />
            <span />
          </div>
        )}

        {returning && error && (
          <div className="signin">
            <p className="signin-lead">{error}</p>
            <button type="button" className="google-button" onClick={() => void signInWithGoogle()}>
              <GoogleMark />
              Réessayer avec Google
            </button>
          </div>
        )}

        {!returning && status !== 'signed-in' && (
          <div className="signin">
            <p className="signin-lead">
              Un compte sert à deux choses, et à rien d'autre : garder tes playlists préférées sous la main, et voter
              pour celles que tu veux voir remonter.
            </p>

            <ul className="signin-points">
              <li>
                <strong>Aucun mot de passe.</strong> Tout passe par Google : il n'y en a aucun à inventer ici, donc
                aucun à se faire voler.
              </li>
              <li>
                <strong>Ton adresse reste privée.</strong> Elle ne s'affiche nulle part sur le site et n'est montrée à
                aucun autre visiteur.
              </li>
              <li>
                <strong>Tes votes sont anonymes.</strong> Seul le total est public. Ton pseudo n'y apparaît que si tu
                le demandes, depuis ton compte.
              </li>
            </ul>

            <button type="button" className="google-button" onClick={() => void signInWithGoogle()}>
              <GoogleMark />
              Continuer avec Google
            </button>

            <p className="signin-note">
              Tu peux supprimer ton compte, et tout ce qu'il contient, à tout moment depuis « Mon compte ».
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
