import { describe, expect, it } from 'vitest'
import {
  eyePairFigures,
  eyePairNames,
  headlineFiguresOf,
  isAhead,
  leadingFigureOf,
  rankingsFor,
  ranksOf,
  type EyePair,
} from '../../src/lib/measureRanking'
import { readFileSync } from 'node:fs'
import { combineCells } from '../../src/lib/fovStats'
import { aggregatePages, figuresOf, listedEntriesOf, parsePage } from '../../src/lib/submissionStore'
import { atlasBeyond, testHmdQuest, vrhpBeyond } from './siteFixtures'

describe('eye pairs', () => {
  it('names each pair’s left and right eye figure', () => {
    expect(eyePairNames).toEqual(['width', 'height', 'renderedWidth', 'renderedHeight', 'widthPastRendered', 'heightPastRendered'])
    expect(eyePairFigures('widthPastRendered')).toEqual(['leftWidthPastRendered', 'rightWidthPastRendered'])
  })

  it('refuses a pair it does not know', () => {
    expect(() => eyePairFigures('diagonal' as EyePair)).toThrow('Unknown eye pair diagonal')
  })
})

describe('headline figures', () => {
  it('takes each eye’s own width for a tool measuring from the centre of each picture, both eyes’ for the others', () => {
    expect(headlineFiguresOf('vrhp').width).toEqual(['leftWidth', 'rightWidth'])
    expect(headlineFiguresOf('wimfov')).toEqual({ width: ['horizontal'], height: ['vertical'] })
  })

  it('leads with the area for the tools outlining each eye from the head, the headline width for the others', () => {
    expect(leadingFigureOf('vrhp', new Map([['leftWidth', 90], ['rightWidth', 95]]))).toBe(95)
    expect(leadingFigureOf('testhmd', new Map([['horizontal', 104], ['area', 40]]))).toBe(104)
    expect(leadingFigureOf('wimfov', new Map([['horizontal', 118], ['area', 44.06]]))).toBe(44.06)
    expect(leadingFigureOf('atlas', new Map([['horizontal', 90]]))).toBeUndefined()
  })

  it('ranks every eye pair only for a tool that has them', () => {
    expect(rankingsFor('vrhp')).toEqual(['highest', ...eyePairNames])
    expect(rankingsFor('testhmd')).toEqual(['highest'])
  })
})

describe('ranksOf', () => {
  it('ranks the highest by the headline width, twice, then the headline height, then all angles added up', () => {
    expect(ranksOf('vrhp', figuresOf(vrhpBeyond), vrhpBeyond.measures).highest).toEqual([9695, 9695, 9693, 49737])
    expect(ranksOf('testhmd', figuresOf(testHmdQuest), testHmdQuest.measures).highest?.slice(0, 3)).toEqual([10000, 10000, 9400])
  })

  it('ranks the highest by the area first for a tool whose measures carry one', () => {
    expect(ranksOf('atlas', figuresOf(atlasBeyond), atlasBeyond.measures).highest?.slice(0, 3)).toEqual([3582, 10600, 9300])
  })

  it('ranks the width as an eye pair, by the wider eye, then the other', () => {
    expect(ranksOf('vrhp', figuresOf(vrhpBeyond), vrhpBeyond.measures).width?.slice(0, 2)).toEqual([9695, 9575])
  })

  it('makes the Dream Air’s WIMFOV measure seeing the most its highest, not the widest', () => {
    // The published WIMFOV page of the Pimax Dream Air as of November 2026, kept as it was then.
    const page = parsePage(readFileSync('tests/unit/dreamAirWimfovPage.json', 'utf8'), 'wimfov', 'pimax-dream-air-lighthouse', 0)
    if (page === null) throw new Error('The Dream Air page is corrupt')
    const entries = listedEntriesOf(page)
    const areas = new Map(entries.map(({ issue, entry }) => [issue, figuresOf(entry.submission).area]))
    expect(Object.fromEntries(areas)).toEqual({ 17: 41.65, 19: 44.06, 21: 40.31, 23: 44.63, 25: 48, 26: 38.52 })
    const widest = entries.reduce((first, second) =>
      (figuresOf(second.entry.submission).horizontal ?? 0) > (figuresOf(first.entry.submission).horizontal ?? 0) ? second : first,
    )
    expect(widest.issue).toBe(19)
    const combined = combineCells(aggregatePages('wimfov', 'pimax-dream-air-lighthouse', [page]), { eyeDepth: [], noseBridge: [], tuning: [], gaze: [] })
    expect(combined.stats.leaders.highest?.issue).toBe(25)
  })

  it('ranks a pair by its larger eye, then the other, a missing figure as null', () => {
    const ranks = ranksOf('vrhp', { leftHeight: 90 }, { left: { up: 45, down: 45 }, right: {} })
    expect(ranks.height).toEqual([9000, null, 9000])
    expect(ranks.renderedWidth).toEqual([null, null, 9000])
  })
})

describe('isAhead', () => {
  const ranked = (rank: readonly (number | null)[], issue: number) => ({ rank, issue })

  it('puts the larger figure first, the first figure that differs deciding', () => {
    expect(isAhead(ranked([10, 5], 1), ranked([10, 4], 2))).toBe(true)
    expect(isAhead(ranked([9, 50], 1), ranked([10, 0], 2))).toBe(false)
  })

  it('puts a present figure ahead of a missing one', () => {
    expect(isAhead(ranked([0], 1), ranked([null], 2))).toBe(true)
    expect(isAhead(ranked([null], 2), ranked([0], 1))).toBe(false)
    expect(isAhead(ranked([1, 2], 1), ranked([1], 2))).toBe(true)
  })

  it('puts the newer issue first on a tie, and never a measure ahead of itself', () => {
    expect(isAhead(ranked([10, null], 5), ranked([10, null], 4))).toBe(true)
    expect(isAhead(ranked([10], 4), ranked([10], 5))).toBe(false)
    expect(isAhead(ranked([10], 4), ranked([10], 4))).toBe(false)
  })
})
