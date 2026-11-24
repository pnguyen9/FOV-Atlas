import { describe, expect, it } from 'vitest'
import { testHmdMeasures, testHmdTotals } from '../../src/lib/testHmd'

describe('testHmdMeasures', () => {
  it('splits each total evenly over both edges', () => {
    const result = testHmdMeasures(104.5, 95)
    expect(result).toEqual({
      ok: true,
      measures: { left: { left: 52.25, up: 47.5, down: 47.5 }, right: { right: 52.25, up: 47.5, down: 47.5 } },
    })
    if (result.ok) expect(testHmdTotals(result.measures)).toEqual({ horizontal: 104.5, vertical: 95 })
  })

  it('accepts up to a full turn, each half reaching straight behind', () => {
    expect(testHmdMeasures(360, 360)).toEqual({
      ok: true,
      measures: { left: { left: 180, up: 180, down: 180 }, right: { right: 180, up: 180, down: 180 } },
    })
  })

  it.each([
    ['zero', 0, 90],
    ['a negative total', 100, -1],
    ['more than 360°', 360.1, 90],
    ['two decimals', 104.25, 90],
    ['a string', '104', 90],
    ['not a number', Number.NaN, 90],
    ['infinity', 100, Number.POSITIVE_INFINITY],
  ])('rejects %s', (_description, horizontal, vertical) => {
    expect(testHmdMeasures(horizontal, vertical)).toEqual({ ok: false, error: 'testhmd-out-of-range' })
  })
})

describe('testHmdTotals', () => {
  it('reads missing halves as zero', () => {
    expect(testHmdTotals({ left: {}, right: {} })).toEqual({ horizontal: 0, vertical: 0 })
  })
})
