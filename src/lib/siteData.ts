/**
 * Loads the published data files (see `submissionStore.ts`) from the site itself.
 *
 * The files are written by the submission Action, but whatever the browser receives is checked
 * again before use: its size, and the frame and every number the pages compute with. A file that
 * fails a check is refused as a whole. Before the first measure is accepted the site has no data
 * at all, and a missing index simply means an empty site.
 */

import {
  aggregatePath,
  dataRoot,
  edgeNames,
  emptyIndex,
  figureNames,
  indexPath,
  pagePath,
  parseIndex,
  parsePage,
  signedFigures,
  tunings,
  type Aggregate,
  type CellStats,
  type DataIndex,
  type HeadsetSummary,
  type Page,
  type Stat,
} from './submissionStore.ts'
import { directions, eyeDepths, gazes, isHeadsetId, noseBridges, tools, type Tool } from './submission.ts'

/** The part of a fetch Response this module reads, so tests can stand in for the network. */
export interface FetchedResponse {
  readonly ok: boolean
  readonly status: number
  text(): Promise<string>
}
export type Fetcher = (url: string, init: RequestInit) => Promise<FetchedResponse>

export interface LoadOptions {
  /** The site's base URL, `import.meta.env.BASE_URL` by default. */
  readonly baseUrl?: string
  readonly fetcher?: Fetcher
}

export type DataError = 'network' | 'not-found' | 'http' | 'too-large' | 'invalid' | 'bad-request'
export type Loaded<Value> = { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: DataError }

/** Far above any file the store writes (a full page is about 100 kB); caps what is parsed. */
export const maximumFileLength = 2_000_000
const formatVersion = 1
/** Every stored angle is at most a half turn, and figures add two of them. */
const maximumStatDegrees = 360

/** `public/`, which the build copies to the site's root. */
const publishedPrefix = dataRoot.slice(0, dataRoot.lastIndexOf('/') + 1)

/** The URL of a store path below `public/`, relative to the site's base. */
export function dataUrl(storePath: string, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}${storePath.slice(publishedPrefix.length)}`
}

const defaultFetcher: Fetcher = (url, init) => fetch(url, init)

async function loadText(storePath: string, options: LoadOptions): Promise<Loaded<string>> {
  const fetcher = options.fetcher ?? defaultFetcher
  const url = dataUrl(storePath, options.baseUrl ?? import.meta.env.BASE_URL)
  let response: FetchedResponse
  let text: string
  try {
    // GitHub Pages caches files for minutes; revalidating shows a new measure as soon as it is deployed.
    response = await fetcher(url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'error' })
    if (!response.ok) return { ok: false, error: response.status === 404 ? 'not-found' : 'http' }
    text = await response.text()
  } catch {
    return { ok: false, error: 'network' }
  }
  return text.length > maximumFileLength ? { ok: false, error: 'too-large' } : { ok: true, value: text }
}

function checked<Value>(loaded: Loaded<string>, parse: (json: string) => Value | null): Loaded<Value> {
  if (!loaded.ok) return loaded
  const value = parse(loaded.value)
  return value === null ? { ok: false, error: 'invalid' } : { ok: true, value }
}

/** The headsets measured with a tool and their summaries; empty when the tool has none. */
export function headsetsOf(index: DataIndex, tool: Tool): ReadonlyMap<string, HeadsetSummary> {
  return new Map(Object.entries(new Map(Object.entries(index.headsets)).get(tool) ?? {}))
}

const badRequest = { ok: false, error: 'bad-request' } as const

/** The list of headsets with measures, per tool; empty while nothing is published. */
export async function loadIndex(options: LoadOptions = {}): Promise<Loaded<DataIndex>> {
  const loaded = await loadText(indexPath, options)
  if (!loaded.ok && loaded.error === 'not-found') return { ok: true, value: emptyIndex() }
  return checked(loaded, parseIndex)
}

export async function loadAggregate(tool: Tool, headset: string, options: LoadOptions = {}): Promise<Loaded<Aggregate>> {
  if (!tools.includes(tool) || !isHeadsetId(headset)) return badRequest
  return checked(await loadText(aggregatePath(tool, headset), options), (json) => parseAggregate(json, tool, headset))
}

export async function loadPage(tool: Tool, headset: string, page: number, options: LoadOptions = {}): Promise<Loaded<Page>> {
  if (!tools.includes(tool) || !isHeadsetId(headset) || !Number.isSafeInteger(page) || page < 0) return badRequest
  return checked(await loadText(pagePath(tool, headset, page), options), (json) => parsePage(json, tool, headset, page))
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Within `limit` of zero, on both sides when `signed`. */
const isDegrees = (value: unknown, limit: number, signed = false): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= (signed ? -limit : 0) && value <= limit

function isStat(value: unknown, signed: boolean): value is Stat {
  if (!isPlainObject(value) || Object.keys(value).length !== 4) return false
  const { count, sum, sumsq, max } = value
  if (!Number.isSafeInteger(count) || (count as number) <= 0) return false
  const total = count as number
  return (
    isDegrees(max, maximumStatDegrees, signed) &&
    isDegrees(sum, maximumStatDegrees * total, signed) &&
    isDegrees(sumsq, maximumStatDegrees * maximumStatDegrees * total)
  )
}

function isStatGroup(value: unknown, keys: readonly string[], signedKeys: readonly string[] = []): boolean {
  return (
    isPlainObject(value) &&
    Object.entries(value).every(([key, stat]) => keys.includes(key) && isStat(stat, signedKeys.includes(key)))
  )
}

const cellGroups = ['left', 'right', 'figures', 'renderedLeft', 'renderedRight'] as const

function isCell(value: unknown): value is CellStats {
  if (!isPlainObject(value) || Object.keys(value).length !== cellGroups.length) return false
  return (
    isStatGroup(value.left, directions) &&
    isStatGroup(value.right, directions) &&
    isStatGroup(value.figures, figureNames, signedFigures) &&
    isStatGroup(value.renderedLeft, edgeNames) &&
    isStatGroup(value.renderedRight, edgeNames)
  )
}

function isCellKey(key: string): boolean {
  const parts = key.split('|')
  const [eyeDepth = '', noseBridge = '', tuning = '', gaze = ''] = parts
  return (
    parts.length === 4 &&
    (eyeDepths as readonly string[]).includes(eyeDepth) &&
    (noseBridges as readonly string[]).includes(noseBridge) &&
    (tunings as readonly string[]).includes(tuning) &&
    (gazes as readonly string[]).includes(gaze)
  )
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * The compare pages compute means, spreads and maxima straight from these numbers, so every cell
 * key and every statistic is checked, not only the frame.
 */
export function parseAggregate(json: string, tool: Tool, headset: string): Aggregate | null {
  const aggregate = parseJson(json)
  if (!isPlainObject(aggregate)) return null
  const { version, count, cells } = aggregate
  if (version !== formatVersion || aggregate.tool !== tool || aggregate.headset !== headset) return null
  if (!Number.isSafeInteger(count) || (count as number) < 0 || !isPlainObject(cells)) return null
  const cellsValid = Object.entries(cells).every(([key, cell]) => isCellKey(key) && isCell(cell))
  return cellsValid ? (aggregate as unknown as Aggregate) : null
}
