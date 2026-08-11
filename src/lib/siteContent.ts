import { useCallback, useEffect, useState } from 'react'
import { GITHUB_CONTENT_PATH, GITHUB_TOKEN_STORAGE_KEY } from '../config'
import { GithubConflictError, getFile, updateFile } from './github'
import type { FolderMeta } from './catalog'

// The single committed editorial file (data/site-content.json): everything
// hand-written that layers on top of what Spotify provides — folder blurbs,
// playlist descriptions, manual tag overrides. The build script merges it into
// /data/catalog.json. New editable site content should become new fields here,
// reusing the same load/save/conflict flow, rather than new files with their
// own plumbing.

export interface PlaylistMeta {
  tags?: string[]
  description?: string
}

export interface SiteContent {
  folders: Record<string, FolderMeta>
  playlists: Record<string, PlaylistMeta>
}

export interface LoadedSiteContent {
  content: SiteContent
  sha: string
}

// Tolerates missing sections so adding a field never breaks older files.
export function normalizeSiteContent(raw: unknown): SiteContent {
  const data = (raw ?? {}) as Partial<SiteContent>
  return { folders: data.folders ?? {}, playlists: data.playlists ?? {} }
}

export async function loadSiteContent(token: string): Promise<LoadedSiteContent> {
  const file = await getFile(token, GITHUB_CONTENT_PATH)
  return { content: normalizeSiteContent(JSON.parse(file.content)), sha: file.sha }
}

// Plain write-through: a Contents API commit to main triggers the deploy
// workflow on its own, so the public site follows without an explicit
// redeploy call. Throws GithubConflictError on a stale sha.
export async function saveSiteContent(
  token: string,
  content: SiteContent,
  sha: string,
  message: string,
): Promise<void> {
  await updateFile(token, GITHUB_CONTENT_PATH, JSON.stringify(content, null, 2) + '\n', sha, message)
}

export interface SiteContentStore {
  token: string
  setToken: (value: string) => void
  loaded: LoadedSiteContent | null
  status: string | null
  conflict: boolean
  reload: () => Promise<void>
  /** Applies `mutate` to the current content and commits the result. */
  save: (mutate: (content: SiteContent) => SiteContent, message: string) => Promise<void>
}

/**
 * One load/save of the editorial file, shared by every editor section on a
 * page. Deliberately a single instance lifted to the page: two independent
 * loads would each hold their own sha and clobber one another on save.
 */
export function useSiteContentStore(): SiteContentStore {
  const [token, setTokenState] = useState(() => localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) ?? '')
  const [loaded, setLoaded] = useState<LoadedSiteContent | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  const setToken = useCallback((value: string) => {
    const trimmed = value.trim()
    setTokenState(trimmed)
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, trimmed)
    if (!trimmed) setLoaded(null)
  }, [])

  const reload = useCallback(async () => {
    if (!token) return
    setStatus('Chargement…')
    try {
      setLoaded(await loadSiteContent(token))
      setConflict(false)
      setStatus(null)
    } catch {
      setStatus('Impossible de charger le contenu du site — vérifie le token GitHub.')
    }
  }, [token])

  useEffect(() => {
    if (token) reload()
  }, [token, reload])

  const save = useCallback(
    async (mutate: (content: SiteContent) => SiteContent, message: string) => {
      if (!token || !loaded) return
      setStatus('Enregistrement…')
      try {
        await saveSiteContent(token, mutate(loaded.content), loaded.sha, message)
        setStatus('Enregistré — le site public se met à jour automatiquement (quelques minutes).')
        await reload()
      } catch (err) {
        if (err instanceof GithubConflictError) {
          setConflict(true)
          setStatus('Conflit : le fichier a changé depuis ton dernier chargement.')
        } else {
          setStatus("Échec de l'enregistrement — vérifie que le token a la permission Contents: Read and write.")
        }
      }
    },
    [token, loaded, reload],
  )

  return { token, setToken, loaded, status, conflict, reload, save }
}

/** Merges into a playlist's entry rather than replacing it, so editing tags
 *  can't wipe the description and vice versa. */
export function withPlaylistMeta(content: SiteContent, id: string, patch: PlaylistMeta): SiteContent {
  return {
    ...content,
    playlists: { ...content.playlists, [id]: { ...content.playlists[id], ...patch } },
  }
}
