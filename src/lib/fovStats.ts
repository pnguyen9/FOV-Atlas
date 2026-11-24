/**
 * The figures the compare pages show: from a headset's aggregate (see `submissionStore.ts`) for
 * everyone who matches the filters, or from a single measure. Every function takes one tool's
 * data at a time; nothing here combines measures of different tools.
 */

import type { RenderedFrame } from './ceiling.ts'
import {
  directions,
  type Direction,
  type EdgeAngles,
  type EyeDepth,
  type EyeMeasure,
  type EyeMeasures,
  type Gaze,
  type NoseBridge,
  type Submission,
  type Tool,
} from './submission.ts'
import {
  cellKey,
  edgeNames,
  figuresOf,
  type Aggregate,
  type CellStats,
  type EdgeName,
  type FigureName,
  type Stat,
  type Tuning,
} from './submissionStore.ts'

/** The soft filters: an empty list accepts any value, several values accept any of them. */
export interface FilterChoices {
  eyeDepth: EyeDepth[]
  noseBridge: NoseBridge[]
  tuning: Tuning[]
  gaze: Gaze[]
}
export type Filters = { readonly [Group in keyof FilterChoices]: readonly FilterChoices[Group][number][] }

const allows = (chosen: readonly string[], value: string | undefined): boolean =>
  chosen.length === 0 || (value !== undefined && chosen.includes(value))

/** Whether an aggregate cell, keyed as `cellKey` builds it, passes every filter group. */
export function cellMatches(key: string, filters: Filters): boolean {
  const [eyeDepth, noseBridge, tuning, gaze] = key.split('|')
  return (
    allows(filters.eyeDepth, eyeDepth) &&
    allows(filters.noseBridge, noseBridge) &&
    allows(filters.tuning, tuning) &&
    allows(filters.gaze, gaze)
  )
}

export const submissionMatches = (submission: Submission, filters: Filters): boolean => cellMatches(cellKey(submission), filters)

function addStat(first: Stat | undefined, second: Stat): Stat {
  if (first === undefined) return second
  return {
    count: first.count + second.count,
    sum: first.sum + second.sum,
    sumsq: first.sumsq + second.sumsq,
    max: Math.max(first.max, second.max),
  }
}

function addGroup<Key extends string>(
  total: Partial<Record<Key, Stat>>,
  group: Partial<Record<Key, Stat>>,
): Partial<Record<Key, Stat>> {
  const sums = new Map<string, Stat>(Object.entries(total) as [Key, Stat][])
  for (const [key, stat] of Object.entries(group) as [Key, Stat][]) sums.set(key, addStat(sums.get(key), stat))
  return Object.fromEntries(sums) as Partial<Record<Key, Stat>>
}

/** Every submission adds to each direction its tool requires, so the largest count is the cell's. */
function cellCount(cell: CellStats): number {
  const stats = [...Object.values(cell.left), ...Object.values(cell.right)]
  return Math.max(0, ...stats.map((stat) => stat.count))
}

const emptyStats = (): CellStats => ({ left: {}, right: {}, figures: {}, renderedLeft: {}, renderedRight: {} })

export interface Combined {
  readonly count: number
  readonly stats: CellStats
}

/** The cells of one aggregate that pass the filters, added up. */
export function combineCells(aggregate: Aggregate, filters: Filters): Combined {
  let stats = emptyStats()
  let count = 0
  for (const [key, cell] of Object.entries(aggregate.cells)) {
    if (!cellMatches(key, filters)) continue
    count += cellCount(cell)
    stats = {
      left: addGroup(stats.left, cell.left),
      right: addGroup(stats.right, cell.right),
      figures: addGroup(stats.figures, cell.figures),
      renderedLeft: addGroup(stats.renderedLeft, cell.renderedLeft),
      renderedRight: addGroup(stats.renderedRight, cell.renderedRight),
    }
  }
  return { count, stats }
}

export interface Summary {
  readonly count: number
  readonly mean: number
  /** Population standard deviation: the spread of the measures themselves. */
  readonly sigma: number
  readonly highest: number
}

export function summarize(stat: Stat): Summary {
  const mean = stat.sum / stat.count
  // Rounding in the stored sums can push a zero variance slightly below zero.
  const variance = Math.max(0, stat.sumsq / stat.count - mean * mean)
  return { count: stat.count, mean, sigma: Math.sqrt(variance), highest: stat.max }
}

export type Statistic = 'highest' | 'mean'

/** One eye's shape: the highest or the mean angle in each direction measured. */
export function eyeShape(stats: Partial<Record<Direction, Stat>>, statistic: Statistic): EyeMeasure {
  const byDirection = new Map(Object.entries(stats))
  return Object.fromEntries(
    directions.flatMap((direction) => {
      const stat = byDirection.get(direction)
      if (stat === undefined) return []
      const summary = summarize(stat)
      return [[direction, statistic === 'highest' ? summary.highest : summary.mean]]
    }),
  )
}

export const shapeOf = (stats: CellStats, statistic: Statistic): EyeMeasures => ({
  left: eyeShape(stats.left, statistic),
  right: eyeShape(stats.right, statistic),
})

export type EyeMode = 'left' | 'right' | 'union' | 'overlap'

/** TestHMD measures both eyes at once, so only what both see together exists for it. */
export const measuresBothEyesAtOnce = (tool: Tool): boolean => tool === 'testhmd'

export function eyeModeFor(tool: Tool, mode: EyeMode): EyeMode {
  return measuresBothEyesAtOnce(tool) ? 'union' : mode
}

/**
 * What one eye, either eye (union: the farther of the two in each direction) or both eyes at once
 * (overlap: the nearer, where both were measured) see.
 */
export function combineEyes({ left, right }: EyeMeasures, mode: EyeMode): EyeMeasure {
  if (mode === 'left') return left
  if (mode === 'right') return right
  const leftAngles = new Map(Object.entries(left))
  const rightAngles = new Map(Object.entries(right))
  return Object.fromEntries(
    directions.flatMap((direction) => {
      const first = leftAngles.get(direction)
      const second = rightAngles.get(direction)
      if (first === undefined || second === undefined) {
        const only = first ?? second
        return mode === 'union' && only !== undefined ? [[direction, only]] : []
      }
      return [[direction, mode === 'union' ? Math.max(first, second) : Math.min(first, second)]]
    }),
  )
}

/** The diagonals pointing away from the nose: where the widest corner of each eye's view lies. */
const outerDiagonals = { left: ['up-left', 'down-left'], right: ['up-right', 'down-right'] } as const

function highestOf(values: readonly (number | undefined)[]): number | undefined {
  const present = values.filter((value) => value !== undefined)
  return present.length === 0 ? undefined : Math.max(...present)
}

export interface Figures {
  readonly count: number
  /** The figures the measures' tool has, as `figuresOf` in `submissionStore.ts` works them out. */
  readonly summaries: Readonly<Partial<Record<FigureName, Summary>>>
  /** The highest outer diagonal of either eye. */
  readonly diagonal: number | undefined
  /** Mean overlap as a share of mean horizontal, in percent. */
  readonly overlapShare: number | undefined
}

function figuresFrom(
  count: number,
  summaries: Readonly<Partial<Record<FigureName, Summary>>>,
  diagonal: number | undefined,
): Figures {
  const { horizontal, overlap } = summaries
  const overlapShare = horizontal === undefined || overlap === undefined ? undefined : (overlap.mean / horizontal.mean) * 100
  return { count, summaries, diagonal, overlapShare }
}

function outerDiagonalOf(left: EyeMeasure, right: EyeMeasure): number | undefined {
  const leftAngles = new Map(Object.entries(left))
  const rightAngles = new Map(Object.entries(right))
  return highestOf([
    ...outerDiagonals.left.map((direction) => leftAngles.get(direction)),
    ...outerDiagonals.right.map((direction) => rightAngles.get(direction)),
  ])
}

export function figuresOfCombined({ count, stats }: Combined): Figures {
  const summaries = Object.fromEntries(Object.entries(stats.figures).map(([figure, stat]) => [figure, summarize(stat)]))
  return figuresFrom(count, summaries, outerDiagonalOf(eyeShape(stats.left, 'highest'), eyeShape(stats.right, 'highest')))
}

/** The same figures for one measure, its own values standing as highest and mean. */
export function figuresOfMeasure(submission: Submission): Figures {
  const summaries = Object.fromEntries(
    Object.entries(figuresOf(submission)).map(([figure, value]) => [figure, { count: 1, mean: value, sigma: 0, highest: value }]),
  )
  return figuresFrom(1, summaries, outerDiagonalOf(submission.measures.left, submission.measures.right))
}

/**
 * The rendered frame of a group's own headsets, for its outline: each edge's highest or mean, and
 * the mean turn of the pictures. Undefined unless every edge of both eyes was read.
 */
export function renderedFrameOfCombined({ stats }: Combined, statistic: Statistic): RenderedFrame | undefined {
  const edgesOf = (group: Partial<Record<EdgeName, Stat>>): EdgeAngles | undefined => {
    const byEdge = new Map(Object.entries(group))
    const values = edgeNames.map((edge) => {
      const stat = byEdge.get(edge)
      return stat === undefined ? undefined : summarize(stat)[statistic === 'highest' ? 'highest' : 'mean']
    })
    const [left, right, up, down] = values
    return left === undefined || right === undefined || up === undefined || down === undefined ? undefined : { left, right, up, down }
  }
  const left = edgesOf(stats.renderedLeft)
  const right = edgesOf(stats.renderedRight)
  const canting = stats.figures.canting
  return left === undefined || right === undefined || canting === undefined ? undefined : { left, right, canting: summarize(canting).mean }
}

/** The largest angle in a set of shapes, to size the chart that draws them. */
export function largestAngle(shapes: readonly EyeMeasure[]): number {
  return Math.max(0, ...shapes.flatMap((shape) => Object.values(shape)))
}
