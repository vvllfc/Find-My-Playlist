import { useEffect, useState } from 'react'
import type { MergedPlaylist } from '../types'

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<MergedPlaylist[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/data/playlists.json')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then((data: MergedPlaylist[]) => setPlaylists(data))
      .catch(() => setError(true))
  }, [])

  return { playlists, error }
}
