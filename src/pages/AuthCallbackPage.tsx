import { useEffect, useState } from 'react'
import { Link } from '../lib/Link'
import { replaceLocation } from '../lib/router'
import { completeGoogleSignIn } from '../lib/authStore'
import './CatalogPage.css'

// Where Google sends people back. It exists to be a distinct path rather than a
// destination — the exchange runs, and the visitor is put back where they were
// before they left. Only a failure keeps anyone here long enough to read it.
export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
  }, [])

  return (
    <div className="catalog-page">
      <div className="hero-zone">
        <div className="hero-inner compact">
          <p className="kicker">
            <Link to="/" className="kicker-link">
              VLF Music
            </Link>
          </p>
          <h1>{error ? 'Connexion interrompue' : 'Connexion en cours…'}</h1>
          {error && <p>{error}</p>}
        </div>
      </div>

      {error && (
        <main className="catalog">
          <Link to="/" className="back-link">
            <span className="back-arrow" aria-hidden="true">
              ←
            </span>
            Retour au catalogue
          </Link>
        </main>
      )}
    </div>
  )
}
