import { useHashRoute } from './lib/hashRoute'
import CatalogPage from './pages/CatalogPage'
import AdminPage from './pages/AdminPage'

function App() {
  const route = useHashRoute()
  return route.startsWith('/admin') ? <AdminPage /> : <CatalogPage />
}

export default App
