/**
 * Loads the published data files (see `submissionStore.ts`) from the site itself.
 *
 * The files are written by the submission Action, but whatever the browser receives is checked
 * again before use: its size, and the frame and every number the pages compute with. A file that
 * fails a check is refused as a whole. Before the first measure is accepted the site has no data
 * at all, and a missing index simply means an empty site.
 *
 * Each file is fetched once per visit and shared by every page that reads it, so moving between
 * Compare and the headset pages, or between tools, loads nothing twice.
 */

import { isCount, isPlainObject, isPositiveCount, parseJson } from './json.ts'
import {
  aggregatePath,
  aggregateVersion,
  cellKeyParts,
  dataRoot,
  emptyIndex,
  figureNames,
  indexPath,
  loginPattern,
  pagePath,
  parseIndex,
  parsePage,
  signedFigures,
  type Aggregate,
  type CellStats,
  type DataIndex,
  type FigureName,
  type Leader,
  type Page,
  type Stat,
} from './submissionStore.ts'
import { parseRenderedAverage, renderedPath, type RenderedAverage } from './renderedAverage.ts'
import { rankingsFor } from './measureRanking.ts'
import { directions, isEyeShape, isHeadsetId, maximumRadialDegrees, maximumTotalDegrees, tools, type Tool } from './submission.ts'

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

/** The value of a file that loaded, or null while it loads or when it failed. */
export function loadedValue<Value>(loaded: Loaded<Value> | null | undefined): Value | null {
  return loaded?.ok === true ? loaded.value : null
}

/** Far above any file the store writes (a full page is about 100 kB); caps what is parsed. */
export const maximumFileLength = 2_000_000
/** Every stored angle is at most a half turn, and figures add two of them. */
const maximumStatDegrees = maximumTotalDegrees

/** `public/`, which the build copies to the site's root. */
const publishedPrefix = dataRoot.slice(0, dataRoot.lastIndexOf('/') + 1)

/** The URL of a store path below `public/`, relative to the site's base. */
export function dataUrl(storePath: string, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}${storePath.slice(publishedPrefix.length)}`
}

/**
 * Each file's load, kept from its start for the rest of the visit, so that pages asking at once
 * share one request. Kept per fetch function, so that a stand-in network never shares answers
 * with another. A failed load is dropped, so the next request tries again.
 */
const loadsByFetcher = new WeakMap<object, Map<string, Promise<Loaded<string>>>>()

function loadText(storePath: string, options: LoadOptions): Promise<Loaded<string>> {
  // The global is read on every call, so that a test standing in for it gets its own loads.
  const fetcher: Fetcher = options.fetcher ?? fetch
  const url = dataUrl(storePath, options.baseUrl ?? import.meta.env.BASE_URL)
  const loads = loadsByFetcher.get(fetcher) ?? new Map<string, Promise<Loaded<string>>>()
  loadsByFetcher.set(fetcher, loads)
  const started = loads.get(url)
  if (started !== undefined) return started
  const load = fetchText(url, fetcher)
  loads.set(url, load)
  void load.then((loaded) => {
    if (!loaded.ok && loads.get(url) === load) loads.delete(url)
  })
  return load
}

async function fetchText(url: string, fetcher: Fetcher): Promise<Loaded<string>> {
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

const badRequest = { ok: false, error: 'bad-request' } as const

/**
 * A headset model's averaged rendered field of view (see `renderedAverage.ts`), checked in full;
 * null when the index lists none. A file pooling another number of measures than the index says
 * is refused.
 */
export async function loadRenderedAverage(
  index: DataIndex,
  headset: string,
  options: LoadOptions = {},
): Promise<Loaded<RenderedAverage | null>> {
  if (!isHeadsetId(headset)) return badRequest
  const listed = new Map(Object.entries(index.rendered ?? {})).get(headset)
  if (listed === undefined) return { ok: true, value: null }
  return checked(await loadText(renderedPath(headset), options), (json) => {
    const average = parseRenderedAverage(json, headset)
    return average?.count === listed ? average : null
  })
}

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
  if (!tools.includes(tool) || !isHeadsetId(headset) || !isCount(page)) return badRequest
  return checked(await loadText(pagePath(tool, headset, page), options), (json) => parsePage(json, tool, headset, page))
}

/** Within `limit` of zero, on both sides when `signed`. */
const isDegrees = (value: unknown, limit: number, signed = false): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= (signed ? -limit : 0) && value <= limit

function isStat(value: unknown, signed: boolean): value is Stat {
  if (!isPlainObject(value) || Object.keys(value).length !== 4) return false
  const { count, sum, sumsq, max } = value
  if (!isPositiveCount(count)) return false
  return (
    isDegrees(max, maximumStatDegrees, signed) &&
    isDegrees(sum, maximumStatDegrees * count, signed) &&
    isDegrees(sumsq, maximumStatDegrees * maximumStatDegrees * count)
  )
}

function isStatGroup(value: unknown, keys: readonly string[], signedKeys: readonly string[] = []): boolean {
  return (
    isPlainObject(value) &&
    Object.entries(value).every(([key, stat]) => keys.includes(key) && isStat(stat, signedKeys.includes(key)))
  )
}

const cellGroups = ['left', 'right', 'figures', 'leaders'] as const

/** Far above the angles of a measure added up, in hundredths of a degree. */
const maximumRankValue = 10_000_000
const isRankValue = (value: unknown): boolean =>
  value === null || (Number.isSafeInteger(value) && Math.abs(value as number) <= maximumRankValue)

const isAngles = (value: unknown): boolean =>
  isEyeShape(value) && Object.values(value).every((degrees) => Math.abs(degrees) <= maximumRadialDegrees)

/** A leader's figures, its rank, and its angles, which the highest's leader carries and no other. */
function isLeader(value: unknown, carriesAngles: boolean): value is Leader {
  if (!isPlainObject(value)) return false
  const { issue, author, rank, figures, measures, ...rest } = value
  const anglesValid = carriesAngles
    ? isPlainObject(measures) && Object.keys(measures).length === 2 && isAngles(measures.left) && isAngles(measures.right)
    : measures === undefined
  return (
    Object.keys(rest).length === 0 &&
    isPositiveCount(issue) &&
    typeof author === 'string' &&
    loginPattern.test(author) &&
    Array.isArray(rank) &&
    rank.length <= 4 &&
    rank.every(isRankValue) &&
    isPlainObject(figures) &&
    Object.entries(figures).every(
      ([figure, degrees]) => figureNames.includes(figure as FigureName) && isDegrees(degrees, maximumStatDegrees, signedFigures.includes(figure as FigureName)),
    ) &&
    anglesValid
  )
}

/** Exactly one leader per ranking the tool has. */
function isLeaders(value: unknown, tool: Tool): boolean {
  if (!isPlainObject(value)) return false
  const rankings: readonly string[] = rankingsFor(tool)
  return (
    Object.keys(value).length === rankings.length &&
    Object.entries(value).every(([pair, leader]) => rankings.includes(pair) && isLeader(leader, pair === 'highest'))
  )
}

function isCell(value: unknown, tool: Tool): value is CellStats {
  if (!isPlainObject(value) || Object.keys(value).length !== cellGroups.length) return false
  return (
    isStatGroup(value.left, directions) &&
    isStatGroup(value.right, directions) &&
    isStatGroup(value.figures, figureNames, signedFigures) &&
    isLeaders(value.leaders, tool)
  )
}

/**
 * The compare pages compute means, spreads and maxima straight from these numbers, so every cell
 * key and every statistic is checked, not only the frame.
 */
export function parseAggregate(json: string, tool: Tool, headset: string): Aggregate | null {
  const aggregate = parseJson(json)
  if (!isPlainObject(aggregate)) return null
  const { version, count, cells } = aggregate
  if (version !== aggregateVersion || aggregate.tool !== tool || aggregate.headset !== headset) return null
  if (!isCount(count) || !isPlainObject(cells)) return null
  const cellsValid = Object.entries(cells).every(([key, cell]) => cellKeyParts(key) !== null && isCell(cell, tool))
  return cellsValid ? (aggregate as unknown as Aggregate) : null
}
