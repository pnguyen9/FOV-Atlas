import { describe, expect, it } from 'vitest'
import {
  eyePairFigures,
  eyePairNames,
  headlineFiguresOf,
  headlineWidthOf,
  isAhead,
  rankingsFor,
  ranksOf,
  type EyePair,
} from '../../src/lib/measureRanking'
import { figuresOf } from '../../src/lib/submissionStore'
import { atlasBeyond, vrhpBeyond } from './siteFixtures'

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
    expect(headlineWidthOf('vrhp', new Map([['leftWidth', 90], ['rightWidth', 95]]))).toBe(95)
    expect(headlineWidthOf('atlas', new Map([['leftWidth', 90]]))).toBeUndefined()
  })

  it('ranks every eye pair only for a tool that has them', () => {
    expect(rankingsFor('vrhp')).toEqual(eyePairNames)
    expect(rankingsFor('testhmd')).toEqual(['width'])
  })
})

describe('ranksOf', () => {
  it('ranks the width by the headline width, then the headline height, then all angles added up', () => {
    expect(ranksOf('atlas', figuresOf(atlasBeyond), atlasBeyond.measures).width?.slice(0, 2)).toEqual([10600, 9300])
    expect(ranksOf('vrhp', figuresOf(vrhpBeyond), vrhpBeyond.measures).width).toEqual([9695, 9693, 49737])
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
