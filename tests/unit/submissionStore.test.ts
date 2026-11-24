import { describe, expect, it } from 'vitest'
import type { Submission } from '../../src/lib/submission'
import {
  aggregatePages,
  aggregatePath,
  bothEyeFiguresOf,
  figuresOf,
  cellKey,
  emptyIndex,
  emptyLookup,
  emptyPage,
  entriesPerPage,
  dataRootOf,
  lookupNumberOf,
  lookupPath,
  pagePath,
  parseIndex,
  parseLookup,
  parsePage,
  serialize,
  serializeLookup,
  serializePage,
  tuningOf,
  withEntry,
  withLocation,
  withoutEntry,
  withRendered,
  withSummary,
  type Page,
} from '../../src/lib/submissionStore'
import { atlasSubmission, testHmdSubmission } from './fixtures'

const tuned = (physicallyModded: boolean, driverTuned: boolean): Submission => ({
  ...atlasSubmission,
  tuning: { ...atlasSubmission.tuning, physicallyModded, driverTuned },
})

describe('paths', () => {
  it('pages submissions and aggregates them per tool and headset under the published data', () => {
    expect(pagePath('vrhp', 'valve-index', 3)).toBe('public/data/submissions/vrhp/valve-index/3.json')
    expect(aggregatePath('vrhp', 'valve-index')).toBe('public/data/aggregates/vrhp/valve-index.json')
  })

  it('groups issues into lookups of a thousand', () => {
    expect([lookupNumberOf(1), lookupNumberOf(999), lookupNumberOf(1000), lookupNumberOf(123_456)]).toEqual([0, 0, 1, 123])
    expect(lookupPath(123)).toBe('data/issues/123.json')
  })

  it('names the directory of every path it builds', () => {
    for (const path of [pagePath('atlas', 'valve-index', 0), aggregatePath('atlas', 'valve-index'), 'public/data/index.json']) {
      expect(dataRootOf(path)).toBe('public/data')
    }
    expect(dataRootOf(lookupPath(4))).toBe('data/issues')
  })

  it.each([
    'public/data/../secret.json',
    'public/data/a/./b.json',
    '/public/data/index.json',
    'public/database.json',
    'public/data/index.js',
    'public/data/A.json',
    'public/data//index.json',
    'public/data/.json',
    'data/issues/../../package.json',
    'data/issues/../index.json',
    'data/issuesx/1.json',
    'data/issues/1.json/',
    'data/index.json',
    'data/issues/1.txt',
  ])('refuses %s', (path) => {
    expect(dataRootOf(path)).toBeNull()
  })
})

describe('cellKey', () => {
  it.each([
    ['stock', false, false],
    ['modded', true, false],
    ['tuned', false, true],
    ['both', true, true],
  ])('names the tuning %s', (expected, modded, driverTuned) => {
    expect(tuningOf(tuned(modded, driverTuned))).toBe(expected)
  })

  it('joins the face fit, tuning and gaze', () => {
    expect(cellKey(atlasSubmission)).toBe('in-between|low|tuned|fixed')
  })
})

describe('entries', () => {
  it('adds, replaces and removes entries by issue number', () => {
    const page = withEntry(emptyPage('atlas', 'bigscreen-beyond-2', 0), 12, { author: 'someone', submission: atlasSubmission })
    const replaced = withEntry(page, 12, { author: 'someone', submission: { ...atlasSubmission, ipd: 60 } })
    expect(Object.keys(replaced.entries)).toEqual(['12'])
    expect(replaced.entries['12']?.submission.ipd).toBe(60)
    expect(withoutEntry(replaced, 12).entries).toEqual({})
    expect(withoutEntry(replaced, 13).entries).toEqual(replaced.entries)
  })
})

describe('bothEyeFiguresOf', () => {
  it('adds the outer edges, takes the taller eye and adds the inner edges', () => {
    expect(bothEyeFiguresOf(atlasSubmission.measures)).toEqual({ horizontal: 108.4, vertical: 95.8, overlap: 82.8 })
  })

  it('has no overlap without inner edges', () => {
    expect(bothEyeFiguresOf(testHmdSubmission.measures)).toEqual({ horizontal: 104.5, vertical: 95 })
  })

  it('has no vertical figure when an eye lacks one', () => {
    expect(bothEyeFiguresOf({ left: { left: 50 }, right: { right: 50 } })).toEqual({ horizontal: 100 })
  })
})

describe('figuresOf', () => {
  it('sets a FOV Atlas measure against the edges its own headset reported', () => {
    expect(figuresOf(atlasSubmission)).toEqual({
      horizontal: 108.4,
      vertical: 95.8,
      overlap: 82.8,
      renderedHorizontal: 110,
      renderedOverlap: 84,
      horizontalPastRendered: -1.6,
    })
  })

  it('has only measured figures without a report', () => {
    expect(figuresOf(testHmdSubmission)).toEqual({ horizontal: 104.5, vertical: 95 })
  })

  it('keeps VR Headset Picker figures per eye, each against the same eye of the link', () => {
    const measures = {
      left: { 'left': 55, 'right': 42, 'up': 43, 'down': 53.9, 'down-left': 59 },
      right: { 'left': 41.5, 'right': 54.3, 'up': 44.2, 'down': 52.5, 'up-right': 52 },
    }
    const typed: Submission = { ...atlasSubmission, tool: 'vrhp', measures, ceiling: { source: 'none' }, cornerMask: 'unknown' }
    const perEye = { leftWidth: 97, leftHeight: 96.9, rightWidth: 95.8, rightHeight: 96.7 }
    expect(figuresOf(typed)).toEqual(perEye)
    const totals = {
      leftHorizontal: 96.95,
      leftVertical: 96.93,
      rightHorizontal: 96.62,
      rightVertical: 96.67,
      binocularHorizontal: 109.24,
      binocularHorizontalOverlap: 84.33,
      binocularVertical: 98.06,
      binocularVerticalOverlap: 95.54,
      binocularDiagonal: 122.66,
    }
    expect(figuresOf({ ...typed, ceiling: { source: 'link', totals } })).toEqual({
      ...perEye,
      renderedHorizontal: 109.24,
      renderedOverlap: 84.33,
      renderedLeftWidth: 96.95,
      renderedLeftHeight: 96.93,
      renderedRightWidth: 96.62,
      renderedRightHeight: 96.67,
      leftWidthPastRendered: 0.05,
      leftHeightPastRendered: -0.03,
      rightWidthPastRendered: -0.82,
      rightHeightPastRendered: 0.03,
    })
  })
})

describe('aggregatePages', () => {
  const other = { ...atlasSubmission, measures: { ...atlasSubmission.measures, left: { ...atlasSubmission.measures.left, up: 40.1 } } }
  const pageOf = (pageNumber: number, submissions: readonly Submission[]): Page =>
    submissions.reduce(
      (current, submission, submissionIndex) =>
        withEntry(current, pageNumber * 10 + submissionIndex + 1, { author: 'someone', submission }),
      emptyPage('atlas', 'bigscreen-beyond-2', pageNumber),
    )
  const pages = [pageOf(0, [atlasSubmission, other]), pageOf(1, [{ ...atlasSubmission, gaze: 'free' as const }])]
  const aggregate = aggregatePages('atlas', 'bigscreen-beyond-2', pages)

  it('splits the submissions of every page into filter cells', () => {
    expect(aggregate.count).toBe(3)
    expect(Object.keys(aggregate.cells)).toEqual(['in-between|low|tuned|fixed', 'in-between|low|tuned|free'])
  })

  it('keeps combinable sums per direction', () => {
    const fixed = aggregate.cells['in-between|low|tuned|fixed']
    expect(fixed?.left.up).toEqual({ count: 2, sum: 82.8, sumsq: 3431.3, max: 42.7 })
    expect(fixed?.right.right).toEqual({ count: 2, sum: 107.6, sumsq: 5788.88, max: 53.8 })
    expect(fixed?.figures.horizontal?.count).toBe(2)
    expect(fixed?.figures.horizontalPastRendered).toEqual({ count: 2, sum: -3.2, sumsq: 5.12, max: -1.6 })
    expect(fixed?.left['up-up-left']).toBeUndefined()
  })

  it('is empty without entries', () => {
    expect(aggregatePages('vrhp', 'valve-index', [emptyPage('vrhp', 'valve-index', 0)])).toEqual({
      version: 1,
      tool: 'vrhp',
      headset: 'valve-index',
      count: 0,
      cells: {},
    })
  })
})

describe('parsePage', () => {
  const page = withEntry(emptyPage('atlas', 'bigscreen-beyond-2', 2), 7, { author: 'someone', submission: atlasSubmission })
  const json = (value: unknown): string => JSON.stringify(value)
  const full = Array.from({ length: entriesPerPage + 1 }, (_, entryIndex) => entryIndex + 1).reduce(
    (current, issue) => withEntry(current, issue, { author: 'someone', submission: atlasSubmission }),
    page,
  )

  it('reads a page it wrote, one entry per line', () => {
    const second = withEntry(page, 8, { author: 'other', submission: atlasSubmission })
    const text = serializePage(second)
    expect(text.split('\n')).toHaveLength(5)
    expect(text.split('\n')[1]).toMatch(/^"7":\{"author":"someone",/)
    expect(parsePage(text, 'atlas', 'bigscreen-beyond-2', 2)).toEqual(second)
  })

  it('reads an empty page it wrote', () => {
    const empty = emptyPage('atlas', 'bigscreen-beyond-2', 0)
    expect(parsePage(serializePage(empty), 'atlas', 'bigscreen-beyond-2', 0)).toEqual(empty)
  })

  it.each([
    ['broken JSON', '{'],
    ['null', 'null'],
    ['another version', json({ ...page, version: 2 })],
    ['another tool', json({ ...page, tool: 'vrhp' })],
    ['another headset', json({ ...page, headset: 'valve-index' })],
    ['another page number', json({ ...page, page: 3 })],
    ['entries that are not an object', json({ ...page, entries: null })],
    ['entries in a list', json({ ...page, entries: [] })],
    ['more entries than a page holds', json(full)],
    ['a key that is not an issue number', json({ ...page, entries: { '07': page.entries['7'] } })],
    ['an entry that is null', json({ ...page, entries: { 7: null } })],
    ['an entry without author', json({ ...page, entries: { 7: { submission: atlasSubmission } } })],
    ['an entry without submission', json({ ...page, entries: { 7: { author: 'someone' } } })],
    ['an entry of another tool', json({ ...page, entries: { 7: { author: 'someone', submission: testHmdSubmission } } })],
    ['an entry of another headset', json({ ...page, entries: { 7: { author: 'someone', submission: { ...atlasSubmission, headset: 'x' } } } })],
  ])('rejects %s', (_description, text) => {
    expect(parsePage(text, 'atlas', 'bigscreen-beyond-2', 2)).toBeNull()
  })
})

describe('issue lookup', () => {
  const location = { tool: 'atlas', headset: 'valve-index', page: 0 } as const
  const lookup = withLocation(withLocation(emptyLookup(2), 2001, location), 2000, { ...location, page: 4 })
  const json = (issues: unknown, lookupNumber = 2): string => JSON.stringify({ version: 1, lookup: lookupNumber, issues })

  it('adds issues in order, replaces and removes them', () => {
    expect(Object.keys(lookup.issues)).toEqual(['2000', '2001'])
    expect(withLocation(lookup, 2001, { ...location, tool: 'vrhp' }).issues['2001']?.tool).toBe('vrhp')
    expect(withLocation(lookup, 2000, null).issues).toEqual({ 2001: location })
  })

  it('reads a lookup it wrote, one issue per line', () => {
    expect(serializeLookup(lookup).split('\n')[1]).toBe('"2000":{"tool":"atlas","headset":"valve-index","page":4},')
    expect(parseLookup(serializeLookup(lookup), 2)).toEqual(lookup)
    expect(parseLookup(serializeLookup(emptyLookup(2)), 2)).toEqual(emptyLookup(2))
  })

  it.each([
    ['broken JSON', '{'],
    ['null', 'null'],
    ['another version', JSON.stringify({ ...lookup, version: 2 })],
    ['another lookup number', json({}, 3)],
    ['issues that are not an object', json(null)],
    ['issues in a list', json([])],
    ['a key that is not an issue number', json({ '02001': location })],
    ['an issue of another lookup', json({ 3001: location })],
    ['a location that is not an object', json({ 2001: 'atlas/valve-index/0' })],
    ['an unknown tool', json({ 2001: { ...location, tool: 'hmdq' } })],
    ['a headset that is not an id', json({ 2001: { ...location, headset: '../../etc' } })],
    ['a headset that is not text', json({ 2001: { ...location, headset: 7 } })],
    ['a negative page', json({ 2001: { ...location, page: -1 } })],
    ['a fractional page', json({ 2001: { ...location, page: 0.5 } })],
    ['a page in text', json({ 2001: { ...location, page: '0' } })],
  ])('rejects %s', (_description, text) => {
    expect(parseLookup(text, 2)).toBeNull()
  })
})

describe('index', () => {
  it('summarises submissions per tool and headset, dropping empty ones', () => {
    const first = withSummary(emptyIndex(), 'vrhp', 'valve-index', { count: 2, pages: 1 })
    const second = withSummary(first, 'vrhp', 'bigscreen-beyond-2', { count: 1, pages: 1 })
    expect(Object.keys(second.headsets.vrhp ?? {})).toEqual(['bigscreen-beyond-2', 'valve-index'])
    const third = withSummary(second, 'atlas', 'valve-index', { count: 101, pages: 2 })
    expect(withSummary(withSummary(third, 'vrhp', 'valve-index', null), 'vrhp', 'bigscreen-beyond-2', null)).toEqual({
      version: 1,
      headsets: { atlas: { 'valve-index': { count: 101, pages: 2 } } },
    })
  })

  it('reads an index it wrote', () => {
    const index = withSummary(emptyIndex(), 'wimfov', 'pimax-crystal-light', { count: 3, pages: 1 })
    expect(parseIndex(serialize(index))).toEqual(index)
    const withAverages = withRendered(withRendered(index, 'valve-index', 2), 'bigscreen-beyond-2', 1)
    expect(parseIndex(serialize(withAverages))).toEqual(withAverages)
  })

  it('lists the headsets with an averaged rendered field of view, leaving the list out once empty', () => {
    const index = withRendered(withRendered(emptyIndex(), 'valve-index', 2), 'bigscreen-beyond-2', 1)
    expect(index.rendered).toEqual({ 'bigscreen-beyond-2': 1, 'valve-index': 2 })
    expect(Object.keys(index.rendered ?? {})).toEqual(['bigscreen-beyond-2', 'valve-index'])
    expect(withRendered(withRendered(index, 'valve-index', null), 'bigscreen-beyond-2', null)).toEqual(emptyIndex())
  })

  const withHeadsets = (headsets: unknown): string => JSON.stringify({ version: 1, headsets })
  const summary = { count: 1, pages: 1 }

  it.each([
    ['broken JSON', '{'],
    ['null', 'null'],
    ['another version', '{"version":2,"headsets":{}}'],
    ['no headsets', '{"version":1}'],
    ['headsets that are null', withHeadsets(null)],
    ['an unknown tool', withHeadsets({ hmdq: {} })],
    ['summaries in a list', withHeadsets({ atlas: [] })],
    ['a headset that is not an id', withHeadsets({ atlas: { '../x': summary } })],
    ['a summary that is not an object', withHeadsets({ atlas: { 'valve-index': 1 } })],
    ['a count of zero', withHeadsets({ atlas: { 'valve-index': { ...summary, count: 0 } } })],
    ['a fractional count', withHeadsets({ atlas: { 'valve-index': { ...summary, count: 1.5 } } })],
    ['no pages', withHeadsets({ atlas: { 'valve-index': { ...summary, pages: 0 } } })],
    ['pages in text', withHeadsets({ atlas: { 'valve-index': { ...summary, pages: '1' } } })],
    ['averages in a list', '{"version":1,"headsets":{},"rendered":[]}'],
    ['an average of a headset that is not an id', '{"version":1,"headsets":{},"rendered":{"../x":1}}'],
    ['an average of no measure', '{"version":1,"headsets":{},"rendered":{"valve-index":0}}'],
  ])('rejects %s', (_description, text) => {
    expect(parseIndex(text)).toBeNull()
  })
})
