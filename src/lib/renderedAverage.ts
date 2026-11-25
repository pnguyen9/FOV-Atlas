/**
 * The averaged rendered field of view of a headset model: what the headsets of one model report
 * they draw, averaged over the FOV Atlas measures that read it. These values come from the
 * headsets themselves, not from what anyone saw, so the other tools' views may show them as a
 * reference, turned to their own starting point; they never enter another tool's figures. A VR
 * Headset Picker measure keeps its own link's totals as its own reference.
 *
 * The values follow hmdq's definitions:
 *
 * - Each eye's width and height across the eye's own picture, as VR Headset Picker links give
 *   them too. FOV Atlas edges start straight ahead of the head: a width is the same from both
 *   starting points, a height is turned back to the picture's own by `pictureVertical`.
 * - Both eyes' horizontal and overlap along the head's horizontal plane: the left eye's left edge
 *   plus the right eye's right edge, and the left eye's right edge plus the right eye's left
 *   edge.
 * - Each edge from straight ahead of the head, and the outward turn of the pictures.
 *
 * Driver tuning changes what a headset draws, so tuned measures are left out. Each stat keeps
 * count, sum, sum of squares, minimum and maximum, so files stay combinable and the spread
 * between units can be told.
 */

import { pictureVertical, roundCenti, type RenderedFrame } from './ceiling.ts'
import { summarize } from './fovStats.ts'
import { isHeadsetId, maximumCantingDegrees, type EdgeAngles, type Submission } from './submission.ts'
import { dataRoot, isPlainObject, parseJson } from './submissionStore.ts'

export const renderedPath = (headset: string): string => `${dataRoot}/rendered/${headset}.json`

const perEyeNames = ['leftWidth', 'leftHeight', 'rightWidth', 'rightHeight'] as const
const bothEyeNames = ['horizontal', 'overlap'] as const
const edgeValueNames = [
  'leftEyeLeft',
  'leftEyeRight',
  'leftEyeUp',
  'leftEyeDown',
  'rightEyeLeft',
  'rightEyeRight',
  'rightEyeUp',
  'rightEyeDown',
] as const
export const renderedValueNames = [...perEyeNames, ...bothEyeNames, ...edgeValueNames, 'turn'] as const
export type RenderedValueName = (typeof renderedValueNames)[number]
export type RenderedValues = Partial<Record<RenderedValueName, number>>

/** Words for each value, for the headset page and the issue comment. */
const renderedValueLabels: ReadonlyMap<RenderedValueName, string> = new Map([
  ['leftWidth', 'Width, left eye'],
  ['leftHeight', 'Height, left eye'],
  ['rightWidth', 'Width, right eye'],
  ['rightHeight', 'Height, right eye'],
  ['horizontal', 'Horizontal, both eyes'],
  ['overlap', 'Overlap, both eyes'],
  ['leftEyeLeft', 'Left eye, left edge'],
  ['leftEyeRight', 'Left eye, right edge'],
  ['leftEyeUp', 'Left eye, top edge'],
  ['leftEyeDown', 'Left eye, bottom edge'],
  ['rightEyeLeft', 'Right eye, left edge'],
  ['rightEyeRight', 'Right eye, right edge'],
  ['rightEyeUp', 'Right eye, top edge'],
  ['rightEyeDown', 'Right eye, bottom edge'],
  ['turn', 'Outward turn of each eye’s picture'],
])
export const renderedValueLabelOf = (name: RenderedValueName): string => renderedValueLabels.get(name) ?? name

/** `count`, `sum` and `sumsq` add up across files; `min` and `max` combine by taking the extreme. */
export interface RenderedStat {
  readonly count: number
  readonly sum: number
  readonly sumsq: number
  readonly min: number
  readonly max: number
}

const formatVersion = 1

export interface RenderedAverage {
  readonly version: typeof formatVersion
  readonly headset: string
  /** The measures averaged. */
  readonly count: number
  readonly values: Readonly<Partial<Record<RenderedValueName, RenderedStat>>>
}

/**
 * The edges of each eye's picture across the picture itself, as VR Headset Picker gives its
 * angles: the turn taken off the outer edge and added to the inner one, heights turned back.
 */
export function pictureEdges(edges: EdgeAngles, turn: number, eye: 'left' | 'right'): EdgeAngles {
  return {
    left: eye === 'left' ? edges.left - turn : edges.left + turn,
    right: eye === 'right' ? edges.right - turn : edges.right + turn,
    up: pictureVertical(edges.up, turn),
    down: pictureVertical(edges.down, turn),
  }
}

/** Whether the measure may enter its model's average: driver tuning may change what is drawn. */
export const entersAverage = (submission: Submission): boolean => !submission.tuning.driverTuned

/**
 * The values a measure adds to its model's average: only FOV Atlas measures read them, and driver
 * tuned ones are left out.
 */
export function renderedValuesOf(submission: Submission): RenderedValues {
  const { ceiling } = submission
  if (!entersAverage(submission) || ceiling.source !== 'measured') return {}
  const { left, right, canting: turn } = ceiling
  const heightOf = (edges: EdgeAngles): number => roundCenti(pictureVertical(edges.up, turn) + pictureVertical(edges.down, turn))
  return {
    leftWidth: roundCenti(left.left + left.right),
    leftHeight: heightOf(left),
    rightWidth: roundCenti(right.left + right.right),
    rightHeight: heightOf(right),
    horizontal: roundCenti(left.left + right.right),
    overlap: roundCenti(left.right + right.left),
    leftEyeLeft: left.left,
    leftEyeRight: left.right,
    leftEyeUp: left.up,
    leftEyeDown: left.down,
    rightEyeLeft: right.left,
    rightEyeRight: right.right,
    rightEyeUp: right.up,
    rightEyeDown: right.down,
    turn,
  }
}

interface Accumulator {
  count: number
  sum: number
  sumsq: number
  min: number
  max: number
}

/**
 * The average of the given measures of one headset model, or null when none of them enters it.
 * Sums are taken in hundredths of a degree, so they stay exact.
 */
export function renderedAverageOf(headset: string, submissions: readonly Submission[]): RenderedAverage | null {
  const accumulators = new Map<RenderedValueName, Accumulator>()
  let count = 0
  for (const submission of submissions) {
    const values = Object.entries(renderedValuesOf(submission)) as [RenderedValueName, number][]
    if (values.length === 0) continue
    count += 1
    for (const [name, degrees] of values) {
      const centi = Math.round(degrees * 100)
      const accumulator = accumulators.get(name) ?? { count: 0, sum: 0, sumsq: 0, min: centi, max: centi }
      accumulator.count += 1
      accumulator.sum += centi
      accumulator.sumsq += centi * centi
      accumulator.min = Math.min(accumulator.min, centi)
      accumulator.max = Math.max(accumulator.max, centi)
      accumulators.set(name, accumulator)
    }
  }
  if (count === 0) return null
  const values = Object.fromEntries(
    [...accumulators].map(([name, accumulator]) => [
      name,
      {
        count: accumulator.count,
        sum: accumulator.sum / 100,
        sumsq: accumulator.sumsq / 10_000,
        min: accumulator.min / 100,
        max: accumulator.max / 100,
      },
    ]),
  )
  return { version: formatVersion, headset, count, values }
}

export interface RenderedSummary {
  readonly count: number
  readonly mean: number
  /** Population standard deviation: how much the units differ. */
  readonly sigma: number
  readonly min: number
  readonly max: number
}

export function summarizeRendered(stat: RenderedStat): RenderedSummary {
  const { count, mean, sigma } = summarize(stat)
  return { count, mean, sigma, min: stat.min, max: stat.max }
}

/** Each value present, summarized, in the order of `renderedValueNames`. */
export function renderedSummaries(average: RenderedAverage): { readonly name: RenderedValueName; readonly summary: RenderedSummary }[] {
  const stats = new Map(Object.entries(average.values))
  return renderedValueNames.flatMap((name) => {
    const stat = stats.get(name)
    return stat === undefined ? [] : [{ name, summary: summarizeRendered(stat) }]
  })
}

export const renderedMean = (average: RenderedAverage | null | undefined, name: RenderedValueName): number | undefined => {
  const stat = average === null || average === undefined ? undefined : new Map(Object.entries(average.values)).get(name)
  return stat === undefined ? undefined : summarizeRendered(stat).mean
}

/** Above this spread, units of one model are said to differ. */
export const unitSpreadDegrees = 2

/**
 * How far apart the units of a model are, when some value spreads by more than
 * `unitSpreadDegrees`: the lowest to highest range of the value that spreads the most. Null when
 * every value stays within it.
 */
export function unitDifference(average: RenderedAverage): number | null {
  const spread = renderedSummaries(average).filter(({ summary }) => summary.sigma > unitSpreadDegrees)
  const widest = spread.reduce<RenderedSummary | null>(
    (worst, { summary }) => (worst === null || summary.sigma > worst.sigma ? summary : worst),
    null,
  )
  return widest === null ? null : widest.max - widest.min
}

export const unitDifferenceWords = (difference: number): string => `Units of this model differ by up to ${difference.toFixed(1)}°`

/** Further from the model's average than this, a new measure's headset gets a maintainer's look. */
export const differsFromAverageDegrees = 4

export interface RenderedDifference {
  readonly name: RenderedValueName
  readonly value: number
  readonly mean: number
  /** How many measures the mean is taken from. */
  readonly count: number
}

/** The values of a measure further than `differsFromAverageDegrees` from an average it is not part of. */
export function renderedDifferences(submission: Submission, average: RenderedAverage | null): RenderedDifference[] {
  if (average === null) return []
  const stats = new Map(Object.entries(average.values))
  return (Object.entries(renderedValuesOf(submission)) as [RenderedValueName, number][]).flatMap(([name, value]) => {
    const stat = stats.get(name)
    if (stat === undefined) return []
    const { mean, count } = summarizeRendered(stat)
    return Math.abs(value - mean) > differsFromAverageDegrees ? [{ name, value, mean, count }] : []
  })
}

/**
 * The model's averaged pictures, as FOV Atlas draws them: each edge's mean from straight ahead
 * of the head, and the mean turn. Undefined unless every edge of both eyes was read.
 */
export function averagedHeadFrame(average: RenderedAverage | null | undefined): RenderedFrame | undefined {
  const mean = (name: RenderedValueName): number | undefined => renderedMean(average, name)
  const edges = (eye: 'leftEye' | 'rightEye'): EdgeAngles | undefined => {
    const [left, right, up, down] = (['Left', 'Right', 'Up', 'Down'] as const).map((edge) => mean(`${eye}${edge}`))
    return left === undefined || right === undefined || up === undefined || down === undefined ? undefined : { left, right, up, down }
  }
  const left = edges('leftEye')
  const right = edges('rightEye')
  const turn = mean('turn')
  return left === undefined || right === undefined || turn === undefined ? undefined : { left, right, turn }
}

/**
 * The same pictures with VR Headset Picker's starting point, the centre of each eye's picture:
 * the turn removed, so each picture faces straight ahead.
 */
export function averagedPictureFrame(average: RenderedAverage | null | undefined): RenderedFrame | undefined {
  const frame = averagedHeadFrame(average)
  if (frame === undefined) return undefined
  return {
    left: pictureEdges(frame.left, frame.turn, 'left'),
    right: pictureEdges(frame.right, frame.turn, 'right'),
    turn: 0,
  }
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

/** Every stored value is at most a half turn, and a both-eye value adds two of them. */
const maximumDegrees = 360

function isRenderedStat(value: unknown, name: RenderedValueName): value is RenderedStat {
  if (!isPlainObject(value) || Object.keys(value).length !== 5) return false
  const { count, sum, sumsq, min, max } = value
  const lowest = name === 'turn' ? -maximumCantingDegrees : 0
  const highest = name === 'turn' ? maximumCantingDegrees : maximumDegrees
  const inRange = (degrees: unknown): degrees is number =>
    typeof degrees === 'number' && Number.isFinite(degrees) && degrees >= lowest && degrees <= highest
  if (!isCount(count) || count === 0 || !inRange(min) || !inRange(max) || min > max) return false
  // Hundredths of a degree per measure is the most rounding a stored sum can carry.
  const slack = count / 100
  return (
    typeof sum === 'number' &&
    sum >= count * min - slack &&
    sum <= count * max + slack &&
    typeof sumsq === 'number' &&
    Number.isFinite(sumsq) &&
    sumsq >= 0 &&
    sumsq <= count * Math.max(min * min, max * max) + slack * maximumDegrees
  )
}

/**
 * Written only by the submission Action, but the pages compute means, spreads and outlines
 * straight from it, so every number is checked.
 */
export function parseRenderedAverage(json: string, headset: string): RenderedAverage | null {
  const average = parseJson(json)
  if (!isPlainObject(average) || average.version !== formatVersion || average.headset !== headset || !isHeadsetId(headset)) {
    return null
  }
  const { count, values } = average
  if (!isCount(count) || count === 0 || !isPlainObject(values)) return null
  // Every measure averaged reads every value.
  const valuesValid =
    Object.keys(values).length === renderedValueNames.length &&
    Object.entries(values).every(
      ([name, stat]) =>
        (renderedValueNames as readonly string[]).includes(name) && isRenderedStat(stat, name as RenderedValueName) && stat.count === count,
    )
  return valuesValid && Object.keys(average).length === 4 ? (average as unknown as RenderedAverage) : null
}
