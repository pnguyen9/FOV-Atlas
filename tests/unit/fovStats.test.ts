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
  shapeOf,
  submissionMatches,
  summarize,
} from '../../src/lib/fovStats'
import type { Filters } from '../../src/lib/fovStats'
import { aggregatePages, emptyPage, withEntry, type Page } from '../../src/lib/submissionStore'
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
      stats: { left: {}, right: {}, figures: {} },
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
    expect(eyeShape(combined.stats.left, 'highest').left).toBe(54.98)
    expect(eyeShape(combined.stats.left, 'mean').left).toBeCloseTo(52.99)
    expect(Object.keys(shapeOf(combined.stats, 'highest').right)).toEqual(['up', 'left', 'down', 'right', 'up-right'])
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
    const empty = { left: {}, right: {}, figures: {} }
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
