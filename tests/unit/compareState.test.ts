import { afterEach, describe, expect, it } from 'vitest'
import { compareState, keepMeasure, resetCompareState, seriesSlotCount, slotOf, togglePick, withPick } from '../../src/pages/compare/compareState'
import { keptMeasureProblem } from '../../src/pages/compare/keptMeasureWords'
import { vrhpBeyond, wimfovBeyond } from './siteFixtures'

describe('picks', () => {
  it('gives each pick the lowest free colour and keeps it', () => {
    const picks = withPick(withPick(withPick([], 'first'), 'second'), 'third')
    const withoutSecond = togglePick(picks, 'second')
    expect(slotOf(withoutSecond, 'third')).toBe(3)
    expect(slotOf(withPick(withoutSecond, 'fourth'), 'fourth')).toBe(2)
  })
  it('starts from the given slot and stops when every colour is taken', () => {
    const fromTwo = withPick([], 'measure', 2)
    expect(slotOf(fromTwo, 'measure')).toBe(2)
    const full = Array.from({ length: seriesSlotCount }, (_, pickIndex) => `pick-${String(pickIndex)}`).reduce(
      (picks, key) => withPick(picks, key),
      withPick([], 'zero').slice(0, 0),
    )
    expect(full).toHaveLength(seriesSlotCount)
    expect(withPick(full, 'one-more')).toEqual(full)
  })
})

describe('kept measure', () => {
  afterEach(resetCompareState)
  it('picks its tool when none is picked, and leaves a chosen tool alone', () => {
    keepMeasure(vrhpBeyond)
    expect(compareState.tool).toBe('vrhp')
    keepMeasure(wimfovBeyond)
    expect(compareState.tool).toBe('vrhp')
    expect(compareState.kept).toEqual(wimfovBeyond)
  })
  it('explains why it can’t be opened', () => {
    expect(keptMeasureProblem('not-base64url')).toBe('The link is damaged: part of it may be missing. (not-base64url)')
    expect(keptMeasureProblem('angle-out-of-range')).toBe('Its values break the rules of a measure. (angle-out-of-range)')
  })
})
