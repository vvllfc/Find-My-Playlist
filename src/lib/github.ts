import { GITHUB_BRANCH, GITHUB_OWNER, GITHUB_REPO, GITHUB_WORKFLOW_FILE } from '../config'

const API_BASE = 'https://api.github.com'

export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  }
}

export class GithubConflictError extends Error {}

export interface GithubFile {
  content: string
  sha: string
}

export async function getFile(token: string, path: string): Promise<GithubFile> {
  const res = await fetch(`${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) {
    throw new Error(`GitHub read failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return { content: decodeBase64Utf8(data.content), sha: data.sha }
}

export async function updateFile(token: string, path: string, content: string, sha: string, message: string): Promise<void> {
  const res = await fetch(`${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: encodeBase64Utf8(content), sha, branch: GITHUB_BRANCH }),
  })
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 409) throw new GithubConflictError(body)
    throw new Error(`GitHub write failed: ${res.status} ${body}`)
  }
}

export async function triggerRedeploy(token: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: GITHUB_BRANCH }),
    },
  )
  if (!res.ok) {
    throw new Error(`GitHub workflow dispatch failed: ${res.status} ${await res.text()}`)
  }
}
