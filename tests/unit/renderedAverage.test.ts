import { describe, expect, it } from 'vitest'
import {
  averagedHeadFrame,
  averagedPictureFrame,
  differsFromAverageDegrees,
  entersAverage,
  parseRenderedAverage,
  pictureEdges,
  pictureVertical,
  renderedAverageOf,
  renderedDifferences,
  renderedMean,
  renderedPath,
  renderedSummaries,
  renderedValueLabelOf,
  renderedValueNames,
  renderedValuesOf,
  summarizeRendered,
  unitDifference,
  unitDifferenceWords,
  type RenderedAverage,
} from '../../src/lib/renderedAverage'
import { serialize } from '../../src/lib/submissionStore'
import type { Submission } from '../../src/lib/submission'
import { atlasBeyond, atlasBeyondSecond, atlasBeyondTuned, atlasIndex, atlasIndexWider, testHmdQuest, vrhpBeyond } from './siteFixtures'

const radians = (degrees: number): number => (degrees * Math.PI) / 180
const degreesOf = (angle: number): number => (angle * 180) / Math.PI

/**
 * A left-eye picture as hmdq reads it: the tangents of its edges on its own plane, turned outward
 * by `turn`. Returns the edges FOV Atlas stores for it, from straight ahead of the head.
 */
function headEdgesOf(tangents: { left: number; right: number; up: number; down: number }, turn: number): Submission['ceiling'] {
  const atTurn = (tangent: number): number => degreesOf(Math.atan(tangent * Math.cos(radians(turn))))
  const left = {
    left: degreesOf(Math.atan(tangents.left)) + turn,
    right: degreesOf(Math.atan(tangents.right)) - turn,
    up: atTurn(tangents.up),
    down: atTurn(tangents.down),
  }
  return { source: 'measured', left, right: { ...left, left: left.right, right: left.left }, canting: turn }
}

describe('renderedValuesOf', () => {
  it('reads every value of a FOV Atlas measure', () => {
    expect(renderedValuesOf(atlasBeyond)).toEqual({
      leftWidth: 97,
      leftHeight: 98.2,
      rightWidth: 97,
      rightHeight: 98.2,
      horizontal: 110,
      overlap: 84,
      leftEyeLeft: 55,
      leftEyeRight: 42,
      leftEyeUp: 44.2,
      leftEyeDown: 54,
      rightEyeLeft: 42,
      rightEyeRight: 55,
      rightEyeUp: 44.2,
      rightEyeDown: 54,
      turn: 0,
    })
  })

  it('gives widths and heights across each eye’s own picture, as hmdq does, however far it is turned', () => {
    const tangents = { left: 1.4, right: 0.9, up: 1.1, down: 1.2 }
    const values = renderedValuesOf({ ...atlasBeyond, ceiling: headEdgesOf(tangents, 10) })
    const across = (first: number, second: number): number => degreesOf(Math.atan(first) + Math.atan(second))
    expect(values.leftWidth).toBeCloseTo(across(tangents.left, tangents.right), 1)
    expect(values.leftHeight).toBeCloseTo(across(tangents.up, tangents.down), 1)
    // Horizontal plus overlap is both eyes' widths: the turn adds to one and comes off the other.
    expect((values.horizontal ?? 0) + (values.overlap ?? 0)).toBeCloseTo((values.leftWidth ?? 0) + (values.rightWidth ?? 0), 1)
  })

  it.each([
    ['a driver-tuned measure', atlasBeyondTuned],
    ['a VR Headset Picker link, which only stands for its own measure', vrhpBeyond],
    ['a measure without a report', testHmdQuest],
  ])('reads nothing from %s', (_description, submission) => {
    expect(renderedValuesOf(submission)).toEqual({})
  })

  it('keeps physically modded measures', () => {
    const modded = { ...atlasBeyond, tuning: { physicallyModded: true, driverTuned: false, details: '' } }
    expect(entersAverage(modded)).toBe(true)
    expect(entersAverage({ ...modded, tuning: { ...modded.tuning, driverTuned: true } })).toBe(false)
  })
})

describe('pictureEdges', () => {
  it('turns head angles back to each picture’s own, mirrored between eyes', () => {
    const edges = { left: 60, right: 40, up: 45, down: 45 }
    expect(pictureEdges(edges, 10, 'left')).toMatchObject({ left: 50, right: 50 })
    expect(pictureEdges(edges, 10, 'right')).toMatchObject({ left: 70, right: 30 })
    expect(pictureEdges(edges, 10, 'left').up).toBeCloseTo(pictureVertical(45, 10))
    expect(pictureVertical(45, 0)).toBeCloseTo(45)
    expect(pictureVertical(45, 10)).toBeGreaterThan(45)
  })
})

describe('renderedAverageOf', () => {
  const average = renderedAverageOf('bigscreen-beyond-2', [atlasBeyond, atlasBeyondSecond, atlasBeyondTuned, vrhpBeyond])

  it('averages the FOV Atlas measures without driver tuning, keeping combinable sums', () => {
    expect(average?.count).toBe(2)
    expect(average?.values.leftEyeLeft).toMatchObject({ count: 2, sum: 110.4, min: 55, max: 55.4 })
    expect(average?.values.leftEyeLeft?.sumsq).toBeCloseTo(55 * 55 + 55.4 * 55.4)
    expect(Object.keys(average?.values ?? {})).toEqual(renderedValueNames)
    expect(renderedMean(average, 'horizontal')).toBeCloseTo(110.4)
    expect(renderedMean(null, 'horizontal')).toBeUndefined()
    expect(renderedPath('valve-index')).toBe('public/data/rendered/valve-index.json')
  })

  it('has none without a measure that enters it', () => {
    expect(renderedAverageOf('bigscreen-beyond-2', [atlasBeyondTuned, vrhpBeyond])).toBeNull()
  })

  it('summarizes each value in order, with words for it', () => {
    const summaries = average === null ? [] : renderedSummaries(average)
    expect(summaries.map(({ name }) => name)).toEqual(renderedValueNames)
    expect(summaries[0]?.summary).toMatchObject({ count: 2, min: 97, max: 97 })
    expect(summarizeRendered({ count: 3, sum: 0.3, sumsq: 0.0299999, min: 0.1, max: 0.1 }).sigma).toBe(0)
    expect(renderedValueLabelOf('turn')).toBe('Outward turn of each eye’s picture')
  })
})

describe('unitDifference', () => {
  it('says nothing while every value stays within 2° of spread', () => {
    const average = renderedAverageOf('bigscreen-beyond-2', [atlasBeyond, atlasBeyondSecond])
    expect(average === null ? undefined : unitDifference(average)).toBeNull()
  })

  it('gives the range of the value that spreads the most', () => {
    const average = renderedAverageOf('valve-index', [atlasIndex, atlasIndexWider])
    // The horizontal spreads the most: 124° on one unit, 134° on the other.
    expect(average === null ? undefined : unitDifference(average)).toBe(10)
    expect(unitDifferenceWords(10)).toBe('Units of this model differ by up to 10.0°')
  })
})

describe('renderedDifferences', () => {
  const average = renderedAverageOf('valve-index', [atlasIndex])

  it('names each value further than the limit from an average the measure isn’t part of', () => {
    const differences = renderedDifferences(atlasIndexWider, average)
    expect(differences.map(({ name }) => name)).toEqual([
      'leftWidth',
      'leftHeight',
      'rightWidth',
      'rightHeight',
      'horizontal',
      'overlap',
      'leftEyeLeft',
      'rightEyeRight',
    ])
    expect(differences[0]).toEqual({ name: 'leftWidth', value: 118, mean: 110, count: 1 })
    expect(differsFromAverageDegrees).toBe(4)
  })

  it('finds nothing close to the average, without an average, or for a measure outside it', () => {
    expect(renderedDifferences(atlasIndex, average)).toEqual([])
    expect(renderedDifferences(atlasIndexWider, null)).toEqual([])
    expect(renderedDifferences({ ...atlasIndexWider, tuning: { ...atlasIndexWider.tuning, driverTuned: true } }, average)).toEqual([])
  })
})

describe('averaged frames', () => {
  const average = renderedAverageOf('valve-index', [atlasIndex, atlasIndexWider])

  it('draws the averaged pictures from straight ahead, turned outward', () => {
    expect(averagedHeadFrame(average)).toEqual({
      left: { left: 64.5, right: 49.5, up: 51.5, down: 53.5 },
      right: { left: 49.5, right: 64.5, up: 51.5, down: 53.5 },
      canting: 5,
    })
  })

  it('draws them from the centre of each picture for VR Headset Picker, the turn removed', () => {
    const frame = averagedPictureFrame(average)
    expect(frame?.canting).toBe(0)
    expect(frame?.left).toMatchObject({ left: 59.5, right: 54.5 })
    expect(frame?.right).toMatchObject({ left: 54.5, right: 59.5 })
    expect(frame?.left.up).toBeCloseTo(pictureVertical(51.5, 5))
  })

  it('has no frame without every edge', () => {
    expect(averagedHeadFrame(null)).toBeUndefined()
    expect(averagedPictureFrame(undefined)).toBeUndefined()
    if (average === null) throw new Error('no average')
    const values = Object.fromEntries(Object.entries(average.values).filter(([name]) => name !== 'rightEyeDown'))
    expect(averagedHeadFrame({ ...average, values })).toBeUndefined()
    const withoutTurn = Object.fromEntries(Object.entries(average.values).filter(([name]) => name !== 'turn'))
    expect(averagedHeadFrame({ ...average, values: withoutTurn })).toBeUndefined()
  })
})

describe('parseRenderedAverage', () => {
  const average = renderedAverageOf('valve-index', [atlasIndex, atlasIndexWider]) as RenderedAverage
  const parse = (value: unknown): RenderedAverage | null => parseRenderedAverage(JSON.stringify(value), 'valve-index')
  const withStat = (name: string, stat: unknown): unknown => ({ ...average, values: { ...average.values, [name]: stat } })
  const stat = average.values.leftWidth

  it('accepts what the Action writes', () => {
    expect(parseRenderedAverage(serialize(average), 'valve-index')).toEqual(average)
  })

  it('accepts a turn toward the nose', () => {
    expect(parse(withStat('turn', { count: 2, sum: -6, sumsq: 18, min: -3, max: -3 }))).not.toBeNull()
  })

  it.each([
    ['text that is not JSON', 'not json'],
    ['an array', []],
    ['another version', { ...average, version: 2 }],
    ['another headset', { ...average, headset: 'htc-vive' }],
    ['an extra field', { ...average, extra: 1 }],
    ['a count of zero', { ...average, count: 0 }],
    ['a fractional count', { ...average, count: 1.5 }],
    ['values in a list', { ...average, values: [] }],
    ['a missing value', { ...average, values: { ...average.values, turn: undefined } }],
    ['an unknown value', withStat('diagonal', stat)],
    ['a value from fewer measures', withStat('leftWidth', { ...stat, count: 1 })],
    ['a stat with an extra field', withStat('leftWidth', { ...stat, mean: 1 })],
    ['a stat that is not an object', withStat('leftWidth', 5)],
    ['a lowest above the highest', withStat('leftWidth', { ...stat, min: 120, max: 110 })],
    ['a negative width', withStat('leftWidth', { ...stat, min: -1 })],
    ['a width past a full turn', withStat('leftWidth', { ...stat, max: 400 })],
    ['a turn past the limit', withStat('turn', { count: 2, sum: 100, sumsq: 5000, min: 50, max: 50 })],
    ['a sum below what the lowest allows', withStat('leftWidth', { ...stat, sum: 100 })],
    ['a sum above what the highest allows', withStat('leftWidth', { ...stat, sum: 300 })],
    ['a text sum', withStat('leftWidth', { ...stat, sum: '228' })],
    ['a text sum of squares', withStat('leftWidth', { ...stat, sumsq: '1' })],
    ['a negative sum of squares', withStat('leftWidth', { ...stat, sumsq: -1 })],
    ['a sum of squares no value can reach', withStat('leftWidth', { ...stat, sumsq: 1e9 })],
    ['a minimum that is not a number', withStat('leftWidth', { ...stat, min: null })],
  ])('refuses %s', (_description, value) => {
    expect(typeof value === 'string' ? parseRenderedAverage(value, 'valve-index') : parse(value)).toBeNull()
  })

  it('refuses a malformed headset id even when the file names it', () => {
    expect(parseRenderedAverage(JSON.stringify({ ...average, headset: '../x' }), '../x')).toBeNull()
  })
})
