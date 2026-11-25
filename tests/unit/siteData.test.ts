import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dataUrl,
  loadAggregate,
  loadIndex,
  loadPage,
  loadRenderedAverage,
  loadedValue,
  maximumFileLength,
  parseAggregate,
  type Fetcher,
  type FetchedResponse,
} from '../../src/lib/siteData'
import { aggregatePages, emptyIndex, emptyPage, serialize, serializePage, withEntry } from '../../src/lib/submissionStore'
import { renderedAverageOf } from '../../src/lib/renderedAverage'
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

describe('loaded files', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches a file once for every page that asks, at once or later', async () => {
    const fetcher = fakeFetcher({ '/FOV-Atlas/data/index.json': serialize(index) })
    const [first, second] = await Promise.all([loadIndex({ baseUrl, fetcher }), loadIndex({ baseUrl, fetcher })])
    expect(second).toEqual(first)
    expect(await loadIndex({ baseUrl, fetcher })).toEqual(first)
    expect(fetcher.calls).toEqual(['/FOV-Atlas/data/index.json'])
  })

  it('tries a failed file again', async () => {
    let failing = true
    const calls: string[] = []
    const fetcher: Fetcher = (url) => {
      calls.push(url)
      return Promise.resolve(failing ? respond(500) : respond(200, serialize(index)))
    }
    expect(await loadIndex({ baseUrl, fetcher })).toEqual({ ok: false, error: 'http' })
    failing = false
    expect(await loadIndex({ baseUrl, fetcher })).toEqual({ ok: true, value: index })
    expect(await loadIndex({ baseUrl, fetcher })).toEqual({ ok: true, value: index })
    expect(calls).toHaveLength(2)
  })

  it('keeps the files of each stand-in network apart', async () => {
    const first = fakeFetcher({ '/FOV-Atlas/data/index.json': serialize(index) })
    const second = fakeFetcher({})
    expect((await loadIndex({ baseUrl, fetcher: first })).ok).toBe(true)
    expect(await loadIndex({ baseUrl, fetcher: second })).toEqual({ ok: true, value: emptyIndex() })
    expect(second.calls).toEqual(['/FOV-Atlas/data/index.json'])
  })
})

describe('loadedValue', () => {
  it('gives the value of a file that loaded, null otherwise', () => {
    expect(loadedValue({ ok: true, value: 3 })).toBe(3)
    expect(loadedValue({ ok: false, error: 'network' })).toBeNull()
    expect(loadedValue(null)).toBeNull()
    expect(loadedValue(undefined)).toBeNull()
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

describe('loadRenderedAverage', () => {
  const average = renderedAverageOf('bigscreen-beyond-2', [{ ...atlasSubmission, tuning: { ...atlasSubmission.tuning, driverTuned: false } }])

  const listing = (headset: string, count = 1): ReturnType<typeof emptyIndex> => ({ ...emptyIndex(), rendered: { [headset]: count } })

  it('reads a model’s averaged rendered field of view, when the index lists one', async () => {
    const fetcher = fakeFetcher({ '/FOV-Atlas/data/rendered/bigscreen-beyond-2.json': serialize(average) })
    expect(await loadRenderedAverage(listing('bigscreen-beyond-2'), 'bigscreen-beyond-2', { baseUrl, fetcher })).toEqual({
      ok: true,
      value: average,
    })
  })

  it('fetches nothing for a model the index lists no average for', async () => {
    const fetcher = fakeFetcher({})
    expect(await loadRenderedAverage(emptyIndex(), 'bigscreen-beyond-2', { baseUrl, fetcher })).toEqual({ ok: true, value: null })
    expect(fetcher.calls).toEqual([])
  })

  it('refuses another headset’s average', async () => {
    const fetcher = fakeFetcher({ '/FOV-Atlas/data/rendered/htc-vive.json': serialize(average) })
    expect(await loadRenderedAverage(listing('htc-vive'), 'htc-vive', { baseUrl, fetcher })).toEqual({ ok: false, error: 'invalid' })
  })

  it('refuses an average pooling another number of measures than the index lists', async () => {
    const fetcher = fakeFetcher({ '/FOV-Atlas/data/rendered/bigscreen-beyond-2.json': serialize(average) })
    expect(await loadRenderedAverage(listing('bigscreen-beyond-2', 2), 'bigscreen-beyond-2', { baseUrl, fetcher })).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('fetches nothing for a malformed headset id', async () => {
    const fetcher = fakeFetcher({})
    expect(await loadRenderedAverage(listing('../index'), '../index', { baseUrl, fetcher })).toEqual({ ok: false, error: 'bad-request' })
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
  const leader = { issue: 4, author: 'lens-fox', rank: [9700, null, 40000], figures: { leftWidth: 97, leftWidthPastRendered: -1 } }
  const widest = { ...leader, measures: { left: { left: 55, right: 42 }, right: { left: 42, right: 55 } } }
  const leaders = {
    width: widest,
    height: leader,
    renderedWidth: leader,
    renderedHeight: leader,
    widthPastRendered: leader,
    heightPastRendered: leader,
  }
  const cell = {
    left: { up: stat },
    right: { 'up-right': stat },
    figures: { horizontal: { count: 2, sum: 200, sumsq: 20000, max: 101 }, leftWidthPastRendered: { count: 2, sum: -3, sumsq: 5, max: -1 } },
    leaders,
  }
  const withFigures = (figures: unknown): unknown => ({ ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, figures } } })
  const withLeaders = (changed: unknown): unknown => ({ ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, leaders: changed } } })
  const withLeader = (changed: unknown): unknown => withLeaders({ ...leaders, height: changed })
  const valid = { version: 2, tool: 'vrhp', headset: 'htc-vive', count: 2, cells: { 'deep-set|low|stock|fixed': cell } }
  const parse = (value: unknown): unknown => parseAggregate(JSON.stringify(value), 'vrhp', 'htc-vive')

  it('accepts a well-formed aggregate, and an empty one', () => {
    expect(parse(valid)).toEqual(valid)
    expect(parse({ ...valid, count: 0, cells: {} })).toEqual({ ...valid, count: 0, cells: {} })
  })

  it('accepts what the store writes', () => {
    expect(parseAggregate(serialize(aggregate), 'atlas', 'bigscreen-beyond-2')).toEqual(aggregate)
    expect(Object.values(aggregate.cells).map((cell) => Object.keys(cell.leaders))).toEqual([['width']])
  })

  it.each([
    ['text that is not JSON', 'not json'],
    ['an array', []],
    ['the version before leaders', { ...valid, version: 1 }],
    ['another tool', { ...valid, tool: 'wimfov' }],
    ['another headset', { ...valid, headset: 'htc-vive-pro' }],
    ['a negative count', { ...valid, count: -1 }],
    ['a fractional count', { ...valid, count: 1.5 }],
    ['cells that are not an object', { ...valid, cells: [] }],
    ['an unknown cell key', { ...valid, cells: { 'deep-set|low|stock': cell } }],
    ['a cell key with an unknown value', { ...valid, cells: { 'deep-set|flat|stock|fixed': cell } }],
    ['a cell that is not an object', { ...valid, cells: { 'deep-set|low|stock|fixed': null } }],
    ['a cell with an extra group', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, extra: {} } } }],
    ['a cell missing a group', { ...valid, cells: { 'deep-set|low|stock|fixed': { left: {}, right: {}, other: {} } } }],
    ['an unknown direction', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { sideways: stat } } } }],
    ['an unknown figure', withFigures({ diagonal: stat })],
    ['a negative figure that is never below zero', withFigures({ horizontal: { ...stat, sum: -1 } })],
    ['a gap past a full turn below zero', withFigures({ leftWidthPastRendered: { ...stat, max: -400 } })],
    ['a stat with an extra field', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, mean: 50 } } } } }],
    ['a stat that is not an object', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: 5 } } } }],
    ['a zero count', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, count: 0 } } } } }],
    ['a maximum past a full turn', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, max: 400 } } } } }],
    ['a negative sum', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, sum: -1 } } } } }],
    ['a sum no count can reach', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, sum: 1000 } } } } }],
    ['a cell without leaders', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, leaders: undefined } } }],
    ['leaders that are not an object', withLeaders([])],
    ['a ranking missing', withLeaders({ ...leaders, height: undefined })],
    ['a ranking the tool lacks', withLeaders({ ...leaders, diagonal: leader })],
    ['a leader that is not an object', withLeader(null)],
    ['a leader with an extra field', withLeader({ ...leader, note: '' })],
    ['a zero issue', withLeader({ ...leader, issue: 0 })],
    ['an author that is no GitHub login', withLeader({ ...leader, author: '-<b>' })],
    ['a rank that is not a list', withLeader({ ...leader, rank: 9700 })],
    ['a rank too long', withLeader({ ...leader, rank: [1, 2, 3, 4, 5] })],
    ['a fractional rank figure', withLeader({ ...leader, rank: [9700.5] })],
    ['a rank figure no measure reaches', withLeader({ ...leader, rank: [1e9] })],
    ['figures that are not an object', withLeader({ ...leader, figures: [] })],
    ['an unknown leader figure', withLeader({ ...leader, figures: { diagonal: 1 } })],
    ['a leader figure below zero that never is', withLeader({ ...leader, figures: { leftWidth: -1 } })],
    ['angles on a leader other than the width’s', withLeader({ ...leader, measures: widest.measures })],
    ['a widest leader without angles', withLeaders({ ...leaders, width: leader })],
    ['a widest leader with a third eye', withLeaders({ ...leaders, width: { ...widest, measures: { ...widest.measures, middle: {} } } })],
    ['a widest leader angle past a half turn', withLeaders({ ...leaders, width: { ...widest, measures: { ...widest.measures, left: { left: 200 } } } })],
    ['a widest leader angle in an unknown direction', withLeaders({ ...leaders, width: { ...widest, measures: { ...widest.measures, left: { sideways: 5 } } } })],
    ['a text sum of squares', { ...valid, cells: { 'deep-set|low|stock|fixed': { ...cell, left: { up: { ...stat, sumsq: '5000' } } } } }],
  ])('refuses %s', (_description, value) => {
    expect(typeof value === 'string' ? parseAggregate(value, 'vrhp', 'htc-vive') : parse(value)).toBeNull()
  })
})


