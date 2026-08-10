import { afterEach, describe, expect, it, vi } from 'vitest'
import { GithubConflictError, decodeBase64Utf8, encodeBase64Utf8, getFile, triggerRedeploy, updateFile } from './github'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('base64 utf-8 helpers', () => {
  it('round-trips accented French text', () => {
    const text = "Playlist chill pour l'été, à écouter déconnecté."
    expect(decodeBase64Utf8(encodeBase64Utf8(text))).toBe(text)
  })
})

describe('getFile', () => {
  it('decodes content and returns sha', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: encodeBase64Utf8('{"a":1}'), sha: 'abc123' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getFile('token', 'data/site-content.json')

    expect(result).toEqual({ content: '{"a":1}', sha: 'abc123' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/repos/vvllfc/Find-My-Playlist/contents/data/site-content.json')
    expect(init.headers.Authorization).toBe('Bearer token')
  })

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'not found' }))
    await expect(getFile('token', 'missing.json')).rejects.toThrow('404')
  })
})

describe('updateFile', () => {
  it('sends base64 content and sha in a PUT to the right branch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)

    await updateFile('token', 'data/site-content.json', '{"a":1}', 'abc123', 'Update content')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body)
    expect(body.sha).toBe('abc123')
    expect(body.branch).toBe('main')
    expect(decodeBase64Utf8(body.content)).toBe('{"a":1}')
  })

  it('throws a GithubConflictError on 409 (stale sha)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => 'conflict' }))
    await expect(updateFile('token', 'p', 'c', 'sha', 'm')).rejects.toBeInstanceOf(GithubConflictError)
  })
})

describe('triggerRedeploy', () => {
  it('posts to the workflow dispatches endpoint for main', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)

    await triggerRedeploy('token')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/actions/workflows/deploy.yml/dispatches')
    expect(JSON.parse(init.body)).toEqual({ ref: 'main' })
  })
})
