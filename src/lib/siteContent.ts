import { GITHUB_CONTENT_PATH } from '../config'
import { getFile, updateFile } from './github'
import type { FolderMeta } from './catalog'

// The single committed editorial file (data/site-content.json): everything
// hand-written that layers on top of what Spotify provides. The build script
// merges it into /data/catalog.json. New editable site content (pinned
// playlists, folder ordering, …) should become new fields here, reusing the
// same load/save/conflict flow, rather than new files with their own plumbing.

export interface SiteContent {
  folders: Record<string, FolderMeta>
  playlists: Record<string, { tags: string[] }>
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
