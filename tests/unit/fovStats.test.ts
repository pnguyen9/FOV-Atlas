import { describe, expect, it } from 'vitest'
import {
  cellMatches,
  combineCells,
  combineEyes,
  eyeModeFor,
  eyeShape,
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
import { testHmdQuest, vrhpBeyond, vrhpBeyondDeepSet, vrhpBeyondThird } from './siteFixtures'

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
  it('refuses a key missing the filtered part', () => {
    expect(cellMatches('deep-set', { ...anyFilters, gaze: ['free'] })).toBe(false)
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
    expect(combined.stats.left.left).toEqual({ count: 3, sum: 159, sumsq: 55 * 55 + 51 * 51 + 53 * 53, max: 55 })
    expect(combined.stats.binocular.horizontal?.count).toBe(3)
  })
  it('keeps only cells passing the filters', () => {
    const combined = combineCells(aggregate, { ...anyFilters, eyeDepth: ['deep-set'] })
    expect(combined.count).toBe(1)
    expect(combined.stats.left.left?.max).toBe(51)
  })
  it('is empty when nothing matches', () => {
    expect(combineCells(aggregate, { ...anyFilters, gaze: ['free'], tuning: ['stock'] })).toEqual({
      count: 0,
      stats: { left: {}, right: {}, binocular: {} },
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
    expect(eyeShape(combined.stats.left, 'highest').left).toBe(55)
    expect(eyeShape(combined.stats.left, 'mean').left).toBe(53)
    expect(Object.keys(shapeOf(combined.stats, 'highest').right)).toEqual(['up', 'left', 'down', 'right', 'up-right'])
  })
})

describe('combineEyes', () => {
  const measures = { left: { left: 50, right: 40, 'down-left': 60 }, right: { left: 42, right: 52, 'up-right': 55 } }
  it('shows one eye as it is', () => {
    expect(combineEyes(measures, 'left')).toBe(measures.left)
    expect(combineEyes(measures, 'right')).toBe(measures.right)
  })
  it('takes the farther angle for either eye, keeping directions one eye lacks', () => {
    expect(combineEyes(measures, 'union')).toEqual({ left: 50, right: 52, 'down-left': 60, 'up-right': 55 })
  })
  it('takes the nearer angle for both eyes, only where both were measured', () => {
    expect(combineEyes(measures, 'overlap')).toEqual({ left: 42, right: 40 })
  })
  it('shows a tool measuring both eyes at once as their union', () => {
    expect(eyeModeFor('testhmd', 'left')).toBe('union')
    expect(eyeModeFor('vrhp', 'left')).toBe('left')
  })
})

describe('figures', () => {
  it('reads an aggregate’s binocular figures and outer diagonal', () => {
    const figures = figuresOfCombined(combineCells(aggregate, anyFilters))
    expect(figures.count).toBe(3)
    expect(figures.horizontal?.highest).toBe(110)
    expect(figures.horizontal?.mean).toBe(106)
    expect(figures.diagonal).toBe(59)
    expect(figures.overlapShare).toBeCloseTo((82 / 106) * 100)
  })
  it('reads a single measure, its values standing as highest and mean', () => {
    const figures = figuresOfMeasure(vrhpBeyond.measures)
    expect(figures.horizontal).toEqual({ count: 1, mean: 110, sigma: 0, highest: 110 })
    expect(figures.diagonal).toBe(59)
  })
  it('leaves out what a tool doesn’t measure', () => {
    const figures = figuresOfMeasure(testHmdQuest.measures)
    expect(figures.overlap).toBeUndefined()
    expect(figures.overlapShare).toBeUndefined()
    expect(figures.diagonal).toBeUndefined()
    expect(figuresOfCombined({ count: 0, stats: { left: {}, right: {}, binocular: {} } }).horizontal).toBeUndefined()
  })
})

describe('largestAngle', () => {
  it('finds the widest angle of all shapes, zero for none', () => {
    expect(largestAngle([{ up: 40 }, { left: 120, down: 30 }])).toBe(120)
    expect(largestAngle([])).toBe(0)
  })
})
