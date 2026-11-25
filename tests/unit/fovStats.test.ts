import { describe, expect, it } from 'vitest'
import {
  cellMatches,
  combineCells,
  eyeModeFor,
  eyeShape,
  eyeView,
  figuresOfCombined,
  figuresOfMeasure,
  largestAngle,
  meanShapeOf,
  submissionMatches,
  summarize,
} from '../../src/lib/fovStats'
import type { Filters } from '../../src/lib/fovStats'
import { aggregatePages, emptyPage, withEntry, type ListedEntry, type Page } from '../../src/lib/submissionStore'
import type { Submission } from '../../src/lib/submission'
import { atlasBeyond, testHmdQuest, vrhpBeyond, vrhpBeyondDeepSet, vrhpBeyondThird } from './siteFixtures'

function pageOf(submissions: readonly Submission[]): Page {
  return submissions.reduce(
    (page, submission, entryIndex) => withEntry(page, entryIndex + 1, { author: 'someone', submission }),
    emptyPage('vrhp', 'bigscreen-beyond-2', 0),
  )
}
const anyFilters: Filters = { eyeDepth: [], noseBridge: [], tuning: [], gaze: [] }
const aggregate = aggregatePages('vrhp', 'bigscreen-beyond-2', [pageOf([vrhpBeyond, vrhpBeyondDeepSet, vrhpBeyondThird])])

describe('cellMatches', () => {
  const key = 'deep-set|high|modded|free'
  it('accepts any cell with no filter', () => {
    expect(cellMatches(key, anyFilters)).toBe(true)
  })
  it('accepts any ticked value within a group', () => {
    expect(cellMatches(key, { ...anyFilters, eyeDepth: ['almost-flush', 'deep-set'] })).toBe(true)
  })
  it.each([
    ['eye depth', { ...anyFilters, eyeDepth: ['almost-flush' as const] }],
    ['nose bridge', { ...anyFilters, noseBridge: ['low' as const] }],
    ['tuning', { ...anyFilters, tuning: ['stock' as const] }],
    ['gaze', { ...anyFilters, gaze: ['fixed' as const] }],
  ])('needs every group to pass: %s', (_group, filters) => {
    expect(cellMatches(key, filters)).toBe(false)
  })
  it('refuses a key cellKey cannot build', () => {
    expect(cellMatches('deep-set', { ...anyFilters, gaze: ['free'] })).toBe(false)
    expect(cellMatches('deep-set', anyFilters)).toBe(false)
  })
  it('filters single submissions the same way', () => {
    expect(submissionMatches(vrhpBeyondDeepSet, { ...anyFilters, tuning: ['modded'] })).toBe(true)
    expect(submissionMatches(vrhpBeyond, { ...anyFilters, tuning: ['modded'] })).toBe(false)
  })
})

describe('combineCells', () => {
  it('adds up every matching cell', () => {
    const combined = combineCells(aggregate, anyFilters)
    expect(combined.count).toBe(3)
    expect(combined.stats.left.left).toMatchObject({ count: 3, max: 54.98 })
    expect(combined.stats.left.left?.sum).toBeCloseTo(158.98)
    expect(combined.stats.left.left?.sumsq).toBeCloseTo(54.98 * 54.98 + 51 * 51 + 53 * 53)
    expect(combined.stats.figures.leftWidth?.count).toBe(3)
  })
  it('keeps only cells passing the filters', () => {
    const combined = combineCells(aggregate, { ...anyFilters, eyeDepth: ['deep-set'] })
    expect(combined.count).toBe(1)
    expect(combined.stats.left.left?.max).toBe(51)
  })
  it('is empty when nothing matches', () => {
    expect(combineCells(aggregate, { ...anyFilters, gaze: ['free'], tuning: ['stock'] })).toEqual({
      count: 0,
      stats: { left: {}, right: {}, figures: {}, leaders: {} },
    })
  })
})

describe('summarize', () => {
  it('gives the mean, the population spread and the highest', () => {
    const summary = summarize({ count: 2, sum: 100, sumsq: 50 * 50 + 50 * 50 + 2 * 4, max: 52 })
    expect(summary.mean).toBe(50)
    expect(summary.sigma).toBeCloseTo(2)
    expect(summary.highest).toBe(52)
  })
  it('never takes the root of a rounding error below zero', () => {
    expect(summarize({ count: 3, sum: 0.3, sumsq: 0.0299999, max: 0.1 }).sigma).toBe(0)
  })
})

describe('shapes', () => {
  const combined = combineCells(aggregate, anyFilters)
  it('takes the highest or the mean per direction', () => {
    expect(eyeShape(combined.stats.left, 'max').left).toBe(54.98)
    expect(eyeShape(combined.stats.left, 'mean').left).toBeCloseTo(52.99)
    expect(Object.keys(meanShapeOf(combined.stats).right)).toEqual(['up', 'left', 'down', 'right', 'up-right'])
    expect(meanShapeOf(combined.stats).left.left).toBeCloseTo(52.99)
  })
})

/** The measures stored on one page and aggregated as the Action does, then the cells passing the filters combined. */
function combinedOf(entries: readonly ListedEntry[], filters: Filters = anyFilters) {
  const tool = entries[0]?.entry.submission.tool ?? 'vrhp'
  const headset = entries[0]?.entry.submission.headset ?? 'bigscreen-beyond-2'
  const page = entries.reduce((built, { issue, entry }) => withEntry(built, issue, entry), emptyPage(tool, headset, 0))
  return combineCells(aggregatePages(tool, headset, [page]), filters)
}
const widestMeasure = (entries: readonly ListedEntry[], filters: Filters) => combinedOf(entries, filters).stats.leaders.highest

describe('the measure leading the width, combined from the cells passing the filters', () => {
  const listed = (issue: number, submission: Submission): ListedEntry => ({ issue, entry: { author: `author${String(issue)}`, submission } })
  const withMeasures = (submission: Submission, measures: Submission['measures']): Submission => ({ ...submission, measures })

  it('picks a whole measure by the widest single eye for a tool measuring from the centre of each picture', () => {
    // The Pimax Dream Air on VR Headset Picker: #18 has the widest left and right edges and #22
    // the highest top, yet #24 has the widest eye, so its whole shape is the one drawn.
    const eye = (left: number, right: number, up: number, down: number) => ({ left, right, up, down })
    const measures = new Map([
      [18, eye(57.47, 42.54, 44.55, 44.55)],
      [22, eye(55, 50, 47.5, 47.5)],
      [24, eye(56, 52, 47.43, 48.57)],
    ])
    const entries = [...measures].map(([issue, left]) => listed(issue, withMeasures(vrhpBeyond, { left, right: left })))
    expect(widestMeasure(entries, anyFilters)?.issue).toBe(24)
  })

  it('takes the wider of the two eyes, not their sum, for a measure from the centre of each picture', () => {
    const lopsided = withMeasures(vrhpBeyond, { left: { left: 60, right: 50 }, right: { left: 30, right: 30 } })
    const even = withMeasures(vrhpBeyond, { left: { left: 50, right: 50 }, right: { left: 50, right: 50 } })
    expect(widestMeasure([listed(1, even), listed(2, lopsided)], anyFilters)?.issue).toBe(2)
  })

  it('ranks a head-frame tool by the horizontal of both eyes', () => {
    const narrow = withMeasures(atlasBeyond, { left: { left: 50, right: 60 }, right: { left: 60, right: 50 } })
    const wide = withMeasures(atlasBeyond, { left: { left: 56, right: 40 }, right: { left: 40, right: 56 } })
    expect(widestMeasure([listed(1, wide), listed(2, narrow)], anyFilters)?.issue).toBe(1)
  })

  it('breaks a tie on width by height, then by all angles together, then by the newest', () => {
    const shaped = (up: number, diagonal: number) =>
      withMeasures(atlasBeyond, { left: { left: 55, right: 40, up, down: 50, 'up-left': diagonal }, right: { left: 40, right: 55, up, down: 50 } })
    expect(widestMeasure([listed(1, shaped(46, 50)), listed(2, shaped(45, 60))], anyFilters)?.issue).toBe(1)
    expect(widestMeasure([listed(1, shaped(45, 60)), listed(2, shaped(45, 50))], anyFilters)?.issue).toBe(1)
    expect(widestMeasure([listed(3, shaped(45, 50)), listed(5, shaped(45, 50)), listed(4, shaped(45, 50))], anyFilters)?.issue).toBe(5)
  })

  it('ranks a measure missing its headline figure below one that has it', () => {
    const noWidth = withMeasures(testHmdQuest, { left: { up: 47, down: 47 }, right: { up: 47, down: 47 } })
    expect(widestMeasure([listed(2, noWidth), listed(1, testHmdQuest)], anyFilters)?.issue).toBe(1)
  })

  it('takes the first of the cells passing the filters, and finds none when all are hidden', () => {
    const entries = [listed(1, vrhpBeyond), listed(2, vrhpBeyondDeepSet), listed(3, vrhpBeyondThird)]
    expect(widestMeasure(entries, anyFilters)?.issue).toBe(1)
    expect(widestMeasure(entries, { ...anyFilters, gaze: ['free', 'fixed'] })?.issue).toBe(1)
    expect(widestMeasure(entries, { ...anyFilters, eyeDepth: ['deep-set'] })?.issue).toBe(2)
    expect(widestMeasure(entries, { ...anyFilters, gaze: ['free'], eyeDepth: ['in-between'] })).toBeUndefined()
    expect(widestMeasure([], anyFilters)).toBeUndefined()
  })
})

describe('pairs of eye figures', () => {
  const listed = (issue: number, submission: Submission): ListedEntry => ({ issue, entry: { author: 'someone', submission } })
  const eyes = (leftWidth: number, rightWidth: number, leftHeight: number, rightHeight: number): Submission =>
    ({
      ...vrhpBeyond,
      measures: {
        left: { left: leftWidth / 2, right: leftWidth / 2, up: leftHeight / 2, down: leftHeight / 2 },
        right: { left: rightWidth / 2, right: rightWidth / 2, up: rightHeight / 2, down: rightHeight / 2 },
      },
    })

  it('takes each pair from one measure: the width from the widest measure, the height from the tallest single eye', () => {
    const entries = [listed(1, eyes(100, 80, 90, 90)), listed(2, eyes(90, 95, 96, 80)), listed(3, eyes(90, 90, 96, 85))]
    const { sources: pairs } = figuresOfCombined(combinedOf(entries))
    expect([pairs.get('width')?.get('leftWidth'), pairs.get('width')?.get('rightWidth')]).toEqual([100, 80])
    expect([pairs.get('height')?.get('leftHeight'), pairs.get('height')?.get('rightHeight')]).toEqual([96, 85])
  })

  it('takes a gap pair from the measure closest to its own headset’s picture', () => {
    const { sources: pairs } = figuresOfCombined(combinedOf([listed(1, eyes(90, 90, 90, 90)), listed(2, eyes(96, 80, 90, 90))]))
    const gaps = pairs.get('widthPastRendered')
    expect([gaps?.get('leftWidthPastRendered'), gaps?.get('rightWidthPastRendered')]).toEqual([-0.95, -16.62])
    expect(pairs.get('renderedWidth')?.get('renderedLeftWidth')).toBe(96.95)
  })

  it('has no source for any pair when no measure passes the filters', () => {
    expect(figuresOfCombined(combinedOf([listed(1, vrhpBeyond)], { ...anyFilters, gaze: ['free'] })).sources.size).toBe(0)
  })

  it('gives a single measure as the source of every pair', () => {
    const { sources: pairs } = figuresOfMeasure(vrhpBeyond)
    expect(pairs.size).toBe(7)
    expect([...pairs.values()].every((source) => source.get('leftWidth') === 96.95)).toBe(true)
  })
})

describe('eyeView', () => {
  const measures = { left: { left: 50, right: 40, 'down-left': 60 }, right: { left: 42, right: 52, 'up-right': 55 } }
  const oneEye = [
    { eye: 'left', direction: 'down-left', degrees: 60 },
    { eye: 'right', direction: 'up-right', degrees: 55 },
  ]
  it('shows one eye as it is, its own diagonal included', () => {
    expect(eyeView(measures, 'left')).toEqual({ shape: measures.left, oneEye: [] })
    expect(eyeView(measures, 'right').shape).toBe(measures.right)
  })
  it('takes the farther angle for either eye, only where both eyes were measured', () => {
    expect(eyeView(measures, 'union')).toEqual({ shape: { left: 50, right: 52 }, oneEye })
  })
  it('takes the nearer angle for both eyes, setting one-eye angles beside it too', () => {
    expect(eyeView(measures, 'overlap')).toEqual({ shape: { left: 42, right: 40 }, oneEye })
  })
  it('keeps each eye’s outer edge in the one shape for a tool measuring both eyes at once', () => {
    const together = { left: { up: 40, left: 50, down: 45 }, right: { up: 42, right: 52, down: 44 } }
    expect(eyeView(together, 'together')).toEqual({ shape: { up: 42, left: 50, down: 45, right: 52 }, oneEye: [] })
  })
  it('shows a tool measuring both eyes at once together, whatever the choice', () => {
    expect(eyeModeFor('testhmd', 'left')).toBe('together')
    expect(eyeModeFor('vrhp', 'left')).toBe('left')
  })
})

describe('figures', () => {
  it('reads an aggregate’s figures and outer diagonal, per eye for VR Headset Picker', () => {
    const figures = figuresOfCombined(combineCells(aggregate, anyFilters))
    expect(figures.count).toBe(3)
    expect(figures.summaries.leftWidth?.highest).toBe(96.95)
    expect(figures.summaries.leftWidth?.mean).toBeCloseTo(93.98)
    expect(figures.summaries.horizontal).toBeUndefined()
    expect(figures.diagonal).toBe(59.04)
    expect(figures.overlapShare).toBeUndefined()
  })
  it('reads a single measure, its values standing as highest and mean', () => {
    const figures = figuresOfMeasure(atlasBeyond)
    expect(figures.summaries.horizontal).toEqual({ count: 1, mean: 106, sigma: 0, highest: 106 })
    expect(figures.summaries.renderedHorizontal?.mean).toBe(110)
    expect(figures.overlapShare).toBeCloseTo((81 / 106) * 100)
    expect(figuresOfMeasure(vrhpBeyond).diagonal).toBe(59.04)
  })
  it('leaves out what a tool doesn’t measure', () => {
    const figures = figuresOfMeasure(testHmdQuest)
    expect(figures.summaries.overlap).toBeUndefined()
    expect(figures.overlapShare).toBeUndefined()
    expect(figures.diagonal).toBeUndefined()
    const empty = { left: {}, right: {}, figures: {}, leaders: {} }
    expect(figuresOfCombined({ count: 0, stats: empty }).summaries.horizontal).toBeUndefined()
  })
})

describe('largestAngle', () => {
  it('finds the widest angle of all shapes, zero for none', () => {
    expect(largestAngle([{ up: 40 }, { left: 120, down: 30 }])).toBe(120)
    expect(largestAngle([])).toBe(0)
    expect(largestAngle([{ up: 40 }], [{ eye: 'left', direction: 'down-left', degrees: 65 }])).toBe(65)
  })
})
