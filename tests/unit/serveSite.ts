/** Stands in for the network: serves the given site files, and a 404 for anything else. */

import { vi } from 'vitest'

export interface ServedSite {
  /** Paths below the site root, as `data/index.json`. */
  readonly files: Map<string, string>
  /** Paths that answer with a server error. */
  readonly failing: Set<string>
  readonly requested: string[]
}

export function serveSite(files: Map<string, string>): ServedSite {
  const site: ServedSite = { files, failing: new Set(), requested: [] }
  vi.stubGlobal('fetch', (url: string) => {
    const path = url.replace(/^\/(FOV-Atlas\/)?/, '')
    site.requested.push(path)
    const body = site.files.get(path)
    const status = site.failing.has(path) ? 500 : body === undefined ? 404 : 200
    return Promise.resolve({ ok: status === 200, status, text: () => Promise.resolve(body ?? '') })
  })
  return site
}
