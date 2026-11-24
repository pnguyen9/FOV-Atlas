import { describe, expect, it } from 'vitest'
import type { Submission } from '../../src/lib/submission'
import {
  aggregatePath,
  aggregateShard,
  binocularOf,
  cellKey,
  emptyIndex,
  emptyShard,
  parseIndex,
  parseShard,
  serialize,
  shardPath,
  tuningOf,
  withCount,
  withEntry,
  withoutEntry,
} from '../../src/lib/submissionStore'
import { atlasSubmission, testHmdSubmission } from './fixtures'

const tuned = (physicallyModded: boolean, driverTuned: boolean): Submission => ({
  ...atlasSubmission,
  tuning: { ...atlasSubmission.tuning, physicallyModded, driverTuned },
})

describe('paths', () => {
  it('shards submissions and aggregates per tool and headset under the published data', () => {
    expect(shardPath('vrhp', 'valve-index')).toBe('public/data/submissions/vrhp/valve-index.json')
    expect(aggregatePath('vrhp', 'valve-index')).toBe('public/data/aggregates/vrhp/valve-index.json')
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
    const shard = withEntry(emptyShard('atlas', 'bigscreen-beyond-2'), 12, { author: 'someone', submission: atlasSubmission })
    const replaced = withEntry(shard, 12, { author: 'someone', submission: { ...atlasSubmission, ipd: 60 } })
    expect(Object.keys(replaced.entries)).toEqual(['12'])
    expect(replaced.entries['12']?.submission.ipd).toBe(60)
    expect(withoutEntry(replaced, 12).entries).toEqual({})
    expect(withoutEntry(replaced, 13).entries).toEqual(replaced.entries)
  })
})

describe('binocularOf', () => {
  it('adds the outer edges, takes the taller eye and adds the inner edges', () => {
    expect(binocularOf(atlasSubmission.measures)).toEqual({ horizontal: 108.4, vertical: 95.8, overlap: 82.8 })
  })

  it('has no overlap without inner edges', () => {
    expect(binocularOf(testHmdSubmission.measures)).toEqual({ horizontal: 104.5, vertical: 95 })
  })

  it('has no vertical figure when an eye lacks one', () => {
    expect(binocularOf({ left: { left: 50 }, right: { right: 50 } })).toEqual({ horizontal: 100 })
  })
})

describe('aggregateShard', () => {
  const other = { ...atlasSubmission, measures: { ...atlasSubmission.measures, left: { ...atlasSubmission.measures.left, up: 40.1 } } }
  const shard = [atlasSubmission, other, { ...atlasSubmission, gaze: 'free' as const }].reduce(
    (current, submission, index) => withEntry(current, index + 1, { author: 'someone', submission }),
    emptyShard('atlas', 'bigscreen-beyond-2'),
  )
  const aggregate = aggregateShard(shard)

  it('splits submissions into filter cells', () => {
    expect(aggregate.count).toBe(3)
    expect(Object.keys(aggregate.cells)).toEqual(['in-between|low|tuned|fixed', 'in-between|low|tuned|free'])
  })

  it('keeps combinable sums per direction', () => {
    const fixed = aggregate.cells['in-between|low|tuned|fixed']
    expect(fixed?.left.up).toEqual({ count: 2, sum: 82.8, sumsq: 3431.3, max: 42.7 })
    expect(fixed?.right.right).toEqual({ count: 2, sum: 107.6, sumsq: 5788.88, max: 53.8 })
    expect(fixed?.binocular.horizontal?.count).toBe(2)
    expect(fixed?.left['up-up-left']).toBeUndefined()
  })

  it('is empty for an empty shard', () => {
    expect(aggregateShard(emptyShard('vrhp', 'valve-index'))).toEqual({
      version: 1,
      tool: 'vrhp',
      headset: 'valve-index',
      count: 0,
      cells: {},
    })
  })
})

describe('parseShard', () => {
  const shard = withEntry(emptyShard('atlas', 'bigscreen-beyond-2'), 7, { author: 'someone', submission: atlasSubmission })
  const json = (value: unknown): string => JSON.stringify(value)

  it('reads a shard it wrote', () => {
    expect(parseShard(serialize(shard), 'atlas', 'bigscreen-beyond-2')).toEqual(shard)
  })

  it.each([
    ['broken JSON', '{'],
    ['null', 'null'],
    ['another version', json({ ...shard, version: 2 })],
    ['another tool', json({ ...shard, tool: 'vrhp' })],
    ['another headset', json({ ...shard, headset: 'valve-index' })],
    ['entries that are not an object', json({ ...shard, entries: null })],
    ['entries in a list', json({ ...shard, entries: [] })],
    ['a key that is not an issue number', json({ ...shard, entries: { '07': shard.entries['7'] } })],
    ['an entry without author', json({ ...shard, entries: { 7: { submission: atlasSubmission } } })],
    ['an entry without submission', json({ ...shard, entries: { 7: { author: 'someone' } } })],
    ['an entry of another tool', json({ ...shard, entries: { 7: { author: 'someone', submission: testHmdSubmission } } })],
    ['an entry of another headset', json({ ...shard, entries: { 7: { author: 'someone', submission: { ...atlasSubmission, headset: 'x' } } } })],
  ])('rejects %s', (_description, text) => {
    expect(parseShard(text, 'atlas', 'bigscreen-beyond-2')).toBeNull()
  })
})

describe('index', () => {
  it('counts submissions per tool and headset, dropping empty ones', () => {
    const first = withCount(emptyIndex(), 'vrhp', 'valve-index', 2)
    const second = withCount(first, 'vrhp', 'bigscreen-beyond-2', 1)
    expect(Object.keys(second.counts.vrhp ?? {})).toEqual(['bigscreen-beyond-2', 'valve-index'])
    const third = withCount(second, 'atlas', 'valve-index', 1)
    expect(withCount(withCount(third, 'vrhp', 'valve-index', 0), 'vrhp', 'bigscreen-beyond-2', 0)).toEqual({
      version: 1,
      counts: { atlas: { 'valve-index': 1 } },
    })
  })

  it('reads an index it wrote', () => {
    const index = withCount(emptyIndex(), 'wimfov', 'pimax-crystal-light', 3)
    expect(parseIndex(serialize(index))).toEqual(index)
  })

  it.each([['{'], ['null'], ['{"version":2,"counts":{}}'], ['{"version":1}'], ['{"version":1,"counts":null}']])(
    'rejects %s',
    (text) => {
      expect(parseIndex(text)).toBeNull()
    },
  )
})
