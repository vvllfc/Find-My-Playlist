import { useEffect, useState } from 'react'
import type { Catalog } from './catalog'

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/data/catalog.json')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then((data: Catalog) => setCatalog(data))
      .catch(() => setError(true))
  }, [])

  return { catalog, error }
}
