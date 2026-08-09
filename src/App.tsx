import { useEffect } from 'react'
import { useHashRoute } from './lib/hashRoute'
import { handleRedirectCallback } from './lib/spotifyAuth'
import CatalogPage from './pages/CatalogPage'
import AdminPage from './pages/AdminPage'

function App() {
  const route = useHashRoute()

  useEffect(() => {
    // Spotify's redirect_uri has no hash (it's registered as plain https://vlfmusic.fr/),
    // so this callback can land while any route is showing — handle it here, then hop
    // back to the admin page regardless of route, since that's the only place a login
    // could have been started from.
    const isOAuthCallback = /[?&](code|error)=/.test(window.location.search)
    if (!isOAuthCallback) return

    handleRedirectCallback().then(() => {
      window.location.hash = '#/admin'
    })
  }, [])

  return route.startsWith('/admin') ? <AdminPage /> : <CatalogPage />
}

export default App
