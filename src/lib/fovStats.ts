/**
 * The figures the compare pages show: from a headset's aggregate (see `submissionStore.ts`) for
 * everyone who matches the filters, or from a single measure. Every function takes one tool's
 * data at a time; nothing here combines measures of different tools.
 */

import { eyePairNames, type EyePair, type FigureValues } from './measureRanking.ts'
import {
  directions,
  measuresBothEyesAtOnce,
  type Direction,
  type Eye,
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
  cellKeyParts,
  figuresOf,
  firstLeader,
  type Aggregate,
  type CellStats,
  type FigureName,
  type Leaders,
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

const allows = (chosen: readonly string[], value: string): boolean => chosen.length === 0 || chosen.includes(value)

/** Whether an aggregate cell, keyed as `cellKey` builds it, passes every filter group. */
export function cellMatches(key: string, filters: Filters): boolean {
  const parts = cellKeyParts(key)
  return (
    parts !== null &&
    allows(filters.eyeDepth, parts.eyeDepth) &&
    allows(filters.noseBridge, parts.noseBridge) &&
    allows(filters.tuning, parts.tuning) &&
    allows(filters.gaze, parts.gaze)
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

function addLeaders(total: Leaders, cell: Leaders): Leaders {
  const firsts = new Map(Object.entries(total) as [EyePair, NonNullable<Leaders[EyePair]>][])
  for (const [pair, leader] of Object.entries(cell) as [EyePair, NonNullable<Leaders[EyePair]>][]) {
    firsts.set(pair, firstLeader(firsts.get(pair), leader))
  }
  return Object.fromEntries(firsts)
}

const emptyStats = (): CellStats => ({ left: {}, right: {}, figures: {}, leaders: {} })

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
      leaders: addLeaders(stats.leaders, cell.leaders),
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

/**
 * What a radar draws for a group: `highest`, the measure leading the width ranking (see
 * `measureRanking.ts`), whole, or `mean`, the mean angle in each direction.
 */
export type Statistic = 'highest' | 'mean'

/** One eye's largest or mean angle in each direction measured, each direction on its own. */
export function eyeShape(stats: Partial<Record<Direction, Stat>>, statistic: 'max' | 'mean'): EyeMeasure {
  const byDirection = new Map(Object.entries(stats))
  return Object.fromEntries(
    directions.flatMap((direction) => {
      const stat = byDirection.get(direction)
      if (stat === undefined) return []
      const summary = summarize(stat)
      return [[direction, statistic === 'max' ? summary.highest : summary.mean]]
    }),
  )
}

/** The mean shape of both eyes. */
export const meanShapeOf = (stats: CellStats): EyeMeasures => ({
  left: eyeShape(stats.left, 'mean'),
  right: eyeShape(stats.right, 'mean'),
})

/**
 * For each pair of eye figures, the figures of the one measure both halves come from (see
 * `measureRanking.ts`); a pair is missing when no measure has it.
 */
export type PairSources = ReadonlyMap<EyePair, FigureValues>

/** The eye choices offered to visitors. */
export type EyeChoice = 'left' | 'right' | 'union' | 'overlap'
/**
 * How the radar shows the eyes: a choice, or `together` for a tool measuring both eyes at once,
 * which has each eye's outer edge on that eye's side only, so both belong to the one shape.
 */
export type EyeMode = EyeChoice | 'together'

export function eyeModeFor(tool: Tool, choice: EyeChoice): EyeMode {
  return measuresBothEyesAtOnce(tool) ? 'together' : choice
}

/** An angle measured on one eye only, which either eye and both eyes leave out of their shape. */
export interface OneEyeValue {
  readonly eye: Eye
  readonly direction: Direction
  readonly degrees: number
}

/** What an eye mode shows: the shape, and the angles beside it that only one eye has. */
export interface EyeView {
  readonly shape: EyeMeasure
  readonly oneEye: readonly OneEyeValue[]
}

/**
 * What one eye, either eye (union: the farther of the two in each direction) or both eyes at once
 * (overlap: the nearer) see. Union and overlap take only the directions measured on both eyes: an
 * angle one eye alone has says nothing about the other eye, so it is set beside the shape.
 * Together takes the farther of the two as union does, and an angle one eye alone has joins the
 * shape.
 */
export function eyeView({ left, right }: EyeMeasures, mode: EyeMode): EyeView {
  if (mode === 'left') return { shape: left, oneEye: [] }
  if (mode === 'right') return { shape: right, oneEye: [] }
  const leftAngles = new Map(Object.entries(left))
  const rightAngles = new Map(Object.entries(right))
  const shape: [Direction, number][] = []
  const oneEye: OneEyeValue[] = []
  for (const direction of directions) {
    const leftDegrees = leftAngles.get(direction)
    const rightDegrees = rightAngles.get(direction)
    if (leftDegrees !== undefined && rightDegrees !== undefined) {
      shape.push([direction, mode === 'overlap' ? Math.min(leftDegrees, rightDegrees) : Math.max(leftDegrees, rightDegrees)])
      continue
    }
    const degrees = leftDegrees ?? rightDegrees
    if (degrees === undefined) continue
    if (mode === 'together') shape.push([direction, degrees])
    else oneEye.push({ eye: leftDegrees === undefined ? 'right' : 'left', direction, degrees })
  }
  return { shape: Object.fromEntries(shape), oneEye }
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
  /** The one measure each pair of eye figures comes from, so both eyes of a pair are one person's. */
  readonly pairs: PairSources
}

function figuresFrom(
  count: number,
  summaries: Readonly<Partial<Record<FigureName, Summary>>>,
  diagonal: number | undefined,
  pairs: PairSources,
): Figures {
  const { horizontal, overlap } = summaries
  const overlapShare = horizontal === undefined || overlap === undefined ? undefined : (overlap.mean / horizontal.mean) * 100
  return { count, summaries, diagonal, overlapShare, pairs }
}

function outerDiagonalOf(left: EyeMeasure, right: EyeMeasure): number | undefined {
  const leftAngles = new Map(Object.entries(left))
  const rightAngles = new Map(Object.entries(right))
  return highestOf([
    ...outerDiagonals.left.map((direction) => leftAngles.get(direction)),
    ...outerDiagonals.right.map((direction) => rightAngles.get(direction)),
  ])
}

/** A group's figures, each pair from the measure leading that pair's ranking. */
export function figuresOfCombined({ count, stats }: Combined): Figures {
  const summaries = Object.fromEntries(Object.entries(stats.figures).map(([figure, stat]) => [figure, summarize(stat)]))
  const leaders = new Map(Object.entries(stats.leaders))
  const pairs = new Map(
    eyePairNames.flatMap((pair) => {
      const leader = leaders.get(pair)
      return leader === undefined ? [] : [[pair, new Map(Object.entries(leader.figures))] as const]
    }),
  )
  return figuresFrom(count, summaries, outerDiagonalOf(eyeShape(stats.left, 'max'), eyeShape(stats.right, 'max')), pairs)
}

/** The same figures for one measure, its own values standing as highest and mean and as every pair. */
export function figuresOfMeasure(submission: Pick<Submission, 'tool' | 'measures' | 'ceiling'>): Figures {
  const own = Object.entries(figuresOf(submission))
  const summaries = Object.fromEntries(own.map(([figure, value]) => [figure, { count: 1, mean: value, sigma: 0, highest: value }]))
  const values = new Map(own)
  const pairs = new Map(eyePairNames.map((pair) => [pair, values]))
  return figuresFrom(1, summaries, outerDiagonalOf(submission.measures.left, submission.measures.right), pairs)
}

/** The largest angle in a set of shapes and lone angles, to size the chart that draws them. */
export function largestAngle(shapes: readonly EyeMeasure[], oneEye: readonly OneEyeValue[] = []): number {
  return Math.max(0, ...shapes.flatMap((shape) => Object.values(shape)), ...oneEye.map(({ degrees }) => degrees))
}
