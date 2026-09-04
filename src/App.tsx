import { useEffect } from 'react'
import { AUTH_CALLBACK_PATH, useRoute } from './lib/router'
import { handleRedirectCallback } from './lib/spotifyAuth'
import CatalogPage from './pages/CatalogPage'
import AdminPage from './pages/AdminPage'
import ModifyPage from './pages/ModifyPage'
import GlossaryPage from './pages/GlossaryPage'
import AuthCallbackPage from './pages/AuthCallbackPage'

function App() {
  const route = useRoute()

  useEffect(() => {
    // Two providers now hand an authorization code back to this same origin,
    // and "?code=" alone no longer says which one it belongs to. Rather than
    // guess, they were given disjoint landing paths: Spotify's redirect_uri is
    // registered verbatim as https://vlfmusic.fr/ and can't move without being
    // re-declared, so it is the Google login that was pointed elsewhere — at
    // /connexion, which AuthCallbackPage owns. The path is the whole rule, and
    // getting it wrong hands one provider's code to the other's token endpoint
    // and spends it: a code is single-use and lives five minutes.
    if (window.location.pathname === AUTH_CALLBACK_PATH) return

    // Spotify's redirect_uri has no hash (it's registered as plain
    // https://vlfmusic.fr/), so this callback can land while any route is
    // showing — handle it here, then hop to whichever private page the login
    // was actually started from: the CI read-only login lives on the admin
    // page, the full-scope edit login on the editor page.
    const isOAuthCallback = /[?&](code|error)=/.test(window.location.search)
    if (!isOAuthCallback) return

    handleRedirectCallback().then((purpose) => {
      window.location.hash = purpose === 'edit' ? '#/modify' : '#/admin'
    })
  }, [])

  if (route.kind === 'admin') return <AdminPage />
  if (route.kind === 'modify') return <ModifyPage />
  if (route.kind === 'glossary') return <GlossaryPage />
  if (route.kind === 'authCallback') return <AuthCallbackPage />
  return <CatalogPage segments={route.segments} />
}

export default App
