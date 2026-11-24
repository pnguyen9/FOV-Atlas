import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dataUrl,
  headsetsOf,
  loadAggregate,
  loadIndex,
  loadPage,
  maximumFileLength,
  parseAggregate,
  type Fetcher,
  type FetchedResponse,
} from '../../src/lib/siteData'
import { aggregatePages, emptyIndex, emptyPage, serialize, serializePage, withEntry } from '../../src/lib/submissionStore'
import type { Tool } from '../../src/lib/submission'
import { atlasSubmission } from './fixtures'

const baseUrl = '/FOV-Atlas/'
const respond = (status: number, body = ''): FetchedResponse => ({
  ok: status >= 200 && status < 300,
  status,
  text: () => Promise.resolve(body),
})

/** Serves the given files by URL; anything else is a 404. */
function fakeFetcher(files: Readonly<Record<string, string>>): Fetcher & { calls: string[] } {
  const served = new Map(Object.entries(files))
  const calls: string[] = []
  const fetcher = (url: string): Promise<FetchedResponse> => {
    calls.push(url)
    const body = served.get(url)
    return Promise.resolve(body === undefined ? respond(404) : respond(200, body))
  }
  return Object.assign(fetcher, { calls })
}

const index = { version: 1, headsets: { atlas: { 'bigscreen-beyond-2': { count: 1, pages: 1 } } } }
const page = withEntry(emptyPage('atlas', 'bigscreen-beyond-2', 0), 7, { author: 'someone', submission: atlasSubmission })
const aggregate = aggregatePages('atlas', 'bigscreen-beyond-2', [page])

describe('dataUrl', () => {
  it('places a store path below the site base', () => {
    expect(dataUrl('public/data/index.json', '/FOV-Atlas/')).toBe('/FOV-Atlas/data/index.json')
    expect(dataUrl('public/data/index.json', '/FOV-Atlas')).toBe('/FOV-Atlas/data/index.json')
  })
})

describe('loadIndex', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the published index', async () => {
    const fetcher = fakeFetcher({ '/FOV-Atlas/data/index.json': serialize(index) })
    expect(await loadIndex({ baseUrl, fetcher })).toEqual({ ok: true, value: index })
  })

  it('treats a missing index as an empty site', async () => {
    expect(await loadIndex({ baseUrl, fetcher: fakeFetcher({}) })).toEqual({ ok: true, value: emptyIndex() })
  })

  it('uses the browser fetch and the build base by default', async () => {
    const fetchStub = vi.fn<Fetcher>(() => Promise.resolve(respond(404)))
    vi.stubGlobal('fetch', fetchStub)
    expect((await loadIndex()).ok).toBe(true)
    const [url, init] = fetchStub.mock.calls[0] ?? []
    expect(url).toBe(`${import.meta.env.BASE_URL}data/index.json`)
    expect(init).toEqual({ cache: 'no-cache', credentials: 'same-origin', redirect: 'error' })
  })

  it.each([
    ['a server error', () => Promise.resolve(respond(500)), 'http'],
    ['a network failure', () => Promise.reject(new TypeError('offline')), 'network'],
    ['a body that fails to read', () => Promise.resolve({ ok: true, status: 200, text: () => Promise.reject(new Error('reset')) }), 'network'],
    ['a file far too large', () => Promise.resolve(respond(200, ' '.repeat(maximumFileLength + 1))), 'too-large'],
    ['a file that is not JSON', () => Promise.resolve(respond(200, '<html>')), 'invalid'],
    ['an index of the wrong shape', () => Promise.resolve(respond(200, '{"version":1,"headsets":{"atlas":{"../x":{"count":1,"pages":1}}}}')), 'invalid'],
  ] satisfies [string, Fetcher, string][])('refuses %s', async (_description, fetcher, error) => {
    expect(await loadIndex({ baseUrl, fetcher })).toEqual({ ok: false, error })
  })
})

describe('loadAggregate', () => {
  it('reads a headset aggregate of one tool', async () => {
    const fetcher = fakeFetcher({ '/FOV-Atlas/data/aggregates/atlas/bigscreen-beyond-2.json': serialize(aggregate) })
    expect(await loadAggregate('atlas', 'bigscreen-beyond-2', { baseUrl, fetcher })).toEqual({ ok: true, value: aggregate })
  })

  it('reports a missing aggregate', async () => {
    expect(await loadAggregate('atlas', 'bigscreen-beyond-2', { baseUrl, fetcher: fakeFetcher({}) })).toEqual({
      ok: false,
      error: 'not-found',
    })
  })

  it('refuses another headset’s aggregate', async () => {
    const fetcher = fakeFetcher({ '/FOV-Atlas/data/aggregates/atlas/htc-vive.json': serialize(aggregate) })
    expect(await loadAggregate('atlas', 'htc-vive', { baseUrl, fetcher })).toEqual({ ok: false, error: 'invalid' })
  })

  it.each([
    ['an unknown tool', 'hmdq', 'bigscreen-beyond-2'],
    ['a malformed headset id', 'atlas', '../index'],
  ])('fetches nothing for %s', async (_description, tool, headset) => {
    const fetcher = fakeFetcher({})
    expect(await loadAggregate(tool as Tool, headset, { baseUrl, fetcher })).toEqual({ ok: false, error: 'bad-request' })
    expect(fetcher.calls).toEqual([])
  })
})

describe('loadPage', () => {
  it('reads a page of submissions', async () => {
    const fetcher = fakeFetcher({ '/FOV-Atlas/data/submissions/atlas/bigscreen-beyond-2/0.json': serializePage(page) })
    expect(await loadPage('atlas', 'bigscreen-beyond-2', 0, { baseUrl, fetcher })).toEqual({ ok: true, value: page })
  })

  it('refuses a page with another number', async () => {
    const fetcher = fakeFetcher({ '/FOV-Atlas/data/submissions/atlas/bigscreen-beyond-2/1.json': serializePage(page) })
    expect(await loadPage('atlas', 'bigscreen-beyond-2', 1, { baseUrl, fetcher })).toEqual({ ok: false, error: 'invalid' })
  })

  it.each([
    ['an unknown tool', 'hmdq', 'bigscreen-beyond-2', 0],
    ['a malformed headset id', 'atlas', 'A', 0],
    ['a negative page', 'atlas', 'bigscreen-beyond-2', -1],
    ['a fractional page', 'atlas', 'bigscreen-beyond-2', 0.5],
  ])('fetches nothing for %s', async (_description, tool, headset, pageNumber) => {
    const fetcher = fakeFetcher({})
    expect(await loadPage(tool as Tool, headset, pageNumber, { baseUrl, fetcher })).toEqual({ ok: false, error: 'bad-request' })
    expect(fetcher.calls).toEqual([])
  })
})

describe('parseAggregate', () => {
  const stat = { count: 2, sum: 100, sumsq: 5000, max: 52 }
  const cell = {
    left: { up: stat },
    right: { 'up-right': stat },
    figures: { horizontal: { count: 2, sum: 200, sumsq: 20000, max: 101 }, leftWidthPastRendered: { count: 2, sum: -3, sumsq: 5, max: -1 } },
    renderedLeft: { left: stat },
    renderedRight: {},
  }
  const withFigures = (figures: unknown): unknown => ({ ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, figures } } })
  const valid = { version: 1, tool: 'vrhp', headset: 'htc-vive', count: 2, cells: { 'deep-set|low|stock|fixed': cell } }
  const parse = (value: unknown): unknown => parseAggregate(JSON.stringify(value), 'vrhp', 'htc-vive')

  it('accepts a well-formed aggregate, and an empty one', () => {
    expect(parse(valid)).toEqual(valid)
    expect(parse({ ...valid, count: 0, cells: {} })).toEqual({ ...valid, count: 0, cells: {} })
  })

  it('accepts what the store writes', () => {
    expect(parseAggregate(serialize(aggregate), 'atlas', 'bigscreen-beyond-2')).toEqual(aggregate)
  })

  it.each([
    ['text that is not JSON', 'not json'],
    ['an array', []],
    ['another version', { ...valid, version: 2 }],
    ['another tool', { ...valid, tool: 'wimfov' }],
    ['another headset', { ...valid, headset: 'htc-vive-pro' }],
    ['a negative count', { ...valid, count: -1 }],
    ['a fractional count', { ...valid, count: 1.5 }],
    ['cells that are not an object', { ...valid, cells: [] }],
    ['an unknown cell key', { ...valid, cells: { 'deep-set|low|stock': cell } }],
    ['a cell key with an unknown value', { ...valid, cells: { 'deep-set|flat|stock|fixed': cell } }],
    ['a cell that is not an object', { ...valid, cells: { 'deep-set|low|stock|fixed': null } }],
    ['a cell with an extra group', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, extra: {} } } }],
    ['a cell missing a group', { ...valid, cells: { 'deep-set|low|stock|fixed': { left: {}, right: {}, figures: {}, renderedLeft: {}, other: {} } } }],
    ['an unknown direction', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { sideways: stat } } } }],
    ['an unknown figure', withFigures({ diagonal: stat })],
    ['a negative figure that is never below zero', withFigures({ horizontal: { ...stat, sum: -1 } })],
    ['a gap past a full turn below zero', withFigures({ leftWidthPastRendered: { ...stat, max: -400 } })],
    ['an unknown rendered edge', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, renderedRight: { 'up-left': stat } } } }],
    ['a stat with an extra field', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, mean: 50 } } } } }],
    ['a stat that is not an object', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: 5 } } } }],
    ['a zero count', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, count: 0 } } } } }],
    ['a maximum past a full turn', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, max: 400 } } } } }],
    ['a negative sum', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, sum: -1 } } } } }],
    ['a sum no count can reach', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, sum: 1000 } } } } }],
    ['a text sum of squares', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, sumsq: '5000' } } } } }],
  ])('refuses %s', (_description, value) => {
    expect(typeof value === 'string' ? parseAggregate(value, 'vrhp', 'htc-vive') : parse(value)).toBeNull()
  })
})

describe('headsetsOf', () => {
  it('lists a tool’s headsets, none for a tool without measures', () => {
    expect([...headsetsOf(index as never, 'atlas')]).toEqual([['bigscreen-beyond-2', { count: 1, pages: 1 }]])
    expect(headsetsOf(emptyIndex(), 'vrhp').size).toBe(0)
  })
})
