import { useEffect } from 'react'
import { useRoute } from './lib/router'
import { handleRedirectCallback } from './lib/spotifyAuth'
import CatalogPage from './pages/CatalogPage'
import AdminPage from './pages/AdminPage'
import ModifyPage from './pages/ModifyPage'
import GlossaryPage from './pages/GlossaryPage'

function App() {
  const route = useRoute()

  useEffect(() => {
    // Spotify's redirect_uri has no hash (it's registered as plain https://vlfmusic.fr/),
    // so this callback can land while any route is showing — handle it here, then hop
    // to whichever private page the login was actually started from: the CI read-only
    // login lives on the admin page, the full-scope edit login on the editor page.
    const isOAuthCallback = /[?&](code|error)=/.test(window.location.search)
    if (!isOAuthCallback) return

    handleRedirectCallback().then((purpose) => {
      window.location.hash = purpose === 'edit' ? '#/modify' : '#/admin'
    })
  }, [])

  if (route.kind === 'admin') return <AdminPage />
  if (route.kind === 'modify') return <ModifyPage />
  if (route.kind === 'glossary') return <GlossaryPage />
  return <CatalogPage segments={route.segments} />
}

export default App
