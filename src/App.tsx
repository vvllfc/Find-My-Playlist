import { useEffect } from 'react'
import { useHashRoute } from './lib/hashRoute'
import { handleRedirectCallback } from './lib/spotifyAuth'
import CatalogPage from './pages/CatalogPage'
import AdminPage from './pages/AdminPage'
import ModifyPage from './pages/ModifyPage'

function App() {
  const route = useHashRoute()

  useEffect(() => {
    // Spotify's redirect_uri has no hash (it's registered as plain https://vlfmusic.fr/),
    // so this callback can land while any route is showing — handle it here, then hop
    // to whichever private page the login was actually started from: the CI read-only
    // login lives on #/admin, the full-scope edit login lives on #/modify.
    const isOAuthCallback = /[?&](code|error)=/.test(window.location.search)
    if (!isOAuthCallback) return

    handleRedirectCallback().then((purpose) => {
      window.location.hash = purpose === 'edit' ? '#/modify' : '#/admin'
    })
  }, [])

  if (route.startsWith('/admin')) return <AdminPage />
  if (route.startsWith('/modify')) return <ModifyPage />
  return <CatalogPage />
}

export default App
