/**
 * Geometry of the radar chart, in SVG units around its centre (the chart's viewBox is centred on
 * 0,0). The distance from the centre is the angle from straight ahead, the same in every
 * direction: an azimuthal equidistant projection, which the "what you see" scenes share. Up is at
 * the top and the wearer's left on the left, as the wearer sees it.
 */

import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { curveCatmullRomClosed, curveCatmullRomOpen, curveLinearClosed, lineRadial, type CurveFactory, type LineRadial } from 'd3-shape'
import type { OutlinePoint } from './ceiling.ts'
import { directions, maximumRadialDegrees, principalDirections, turnOf, type Direction, type EyeMeasure } from './submission.ts'

export const radarHalfSize = 260
export const plotRadius = 210
export const ringStepDegrees = 10
/** The smallest reach drawn, so that narrow headsets still show their proportions. */
const minimumReachDegrees = 70
const labelGap = 18

export type RadialScale = ScaleLinear<number, number>

/** The chart reaches the next ring past the widest angle shown, never past straight behind. */
export function reachOf(largestDegrees: number): number {
  const rounded = Math.ceil(largestDegrees / ringStepDegrees) * ringStepDegrees
  return Math.min(maximumRadialDegrees, Math.max(minimumReachDegrees, rounded))
}

export const radialScale = (reach: number, radius = plotRadius): RadialScale => scaleLinear().domain([0, reach]).range([0, radius])

export interface ScreenPoint {
  readonly screenX: number
  readonly screenY: number
}

export function screenPoint(turn: number, distance: number): ScreenPoint {
  return { screenX: -Math.sin(turn) * distance, screenY: -Math.cos(turn) * distance }
}

type Entry = readonly [Direction, number]
function entriesOf(shape: EyeMeasure): Entry[] {
  const angles = new Map(Object.entries(shape))
  return directions.flatMap((direction) => {
    const degrees = angles.get(direction)
    return degrees === undefined ? [] : [[direction, degrees] as const]
  })
}

/**
 * The Catmull-Rom parameterisation of the shape curves (d3's alpha; 0.5 is centripetal). The
 * closed curve and the open runs cut from it share it, so that a run lies exactly on the closed curve.
 */
const catmullRomAlpha = 0.5

function entryLine(curve: CurveFactory, scale: RadialScale): LineRadial<Entry> {
  // d3 measures angles clockwise from the top, the opposite way round from the directions.
  return lineRadial<Entry>()
    .angle(([direction]) => -turnOf(direction))
    .radius(([, degrees]) => scale(degrees))
    .curve(curve)
}

/** A smooth closed curve through the shape's points; empty below two points. */
export function shapePath(shape: EyeMeasure, scale: RadialScale): string {
  const entries = entriesOf(shape)
  if (entries.length < 2) return ''
  return entryLine(curveCatmullRomClosed.alpha(catmullRomAlpha), scale)(entries) ?? ''
}

const isPrincipal = (direction: Direction): boolean => principalDirections.includes(direction)

/** Whether a principal direction lies strictly between two directions, going round from the first. */
function passesPrincipal(from: Direction, to: Direction): boolean {
  const start = directions.indexOf(from)
  // Every other direction is principal, so this ends within two steps.
  for (let step = 1; ; step += 1) {
    const direction = directions[(start + step) % directions.length] as Direction
    if (direction === to) return false
    if (isPrincipal(direction)) return true
  }
}

/** The stretch of a shape's curve between two neighbouring measured directions. */
export interface CurveSegment {
  readonly from: Direction
  readonly to: Direction
  /** False where it passes over a principal direction nobody measured, so it only joins its ends. */
  readonly measured: boolean
}

/**
 * The segments of a shape's closed curve, from each measured direction to the next. In-between
 * directions are optional, so passing over one of those counts as measured. Below three points
 * the curve is only a line between them, and none of it counts as measured.
 */
export function curveSegments(shape: EyeMeasure): CurveSegment[] {
  const entries = entriesOf(shape)
  if (entries.length < 2) return []
  return entries.map(([from], entryIndex) => {
    const [to] = entries[(entryIndex + 1) % entries.length] as Entry
    return { from, to, measured: entries.length >= 3 && !passesPrincipal(from, to) }
  })
}

/** Whether any of a shape's curve is drawn without being measured. */
export const hasUnmeasured = (shape: EyeMeasure): boolean => curveSegments(shape).some((segment) => !segment.measured)

/** A stretch of a shape's curve, and whether the tool measured every principal direction it passes. */
export interface CurveSpan {
  readonly path: string
  readonly measured: boolean
}

export interface ShapeCurve {
  /** The whole closed curve, as `shapePath` draws it. */
  readonly path: string
  /** The same curve split where it changes between measured and not. */
  readonly spans: readonly CurveSpan[]
}

/**
 * A shape's closed curve and its measured and unmeasured stretches. The closed Catmull-Rom curve
 * between two neighbouring points depends only on the point before and the point after, so each
 * run of segments is the open curve through its points with one more on either side.
 */
export function shapeCurve(shape: EyeMeasure, scale: RadialScale): ShapeCurve {
  const path = shapePath(shape, scale)
  const segments = curveSegments(shape)
  const firstChange = segments.findIndex((segment, segmentIndex) => segment.measured !== segments.at(segmentIndex - 1)?.measured)
  if (firstChange === -1) return { path, spans: path === '' ? [] : [{ path, measured: segments[0]?.measured ?? false }] }
  const entries = entriesOf(shape)
  const runs: { first: number; count: number; measured: boolean }[] = []
  for (let step = 0; step < segments.length; step += 1) {
    const segmentIndex = (firstChange + step) % segments.length
    const { measured } = segments.at(segmentIndex) as CurveSegment
    const current = runs.at(-1)
    if (current?.measured === measured) current.count += 1
    else runs.push({ first: segmentIndex, count: 1, measured })
  }
  const line = entryLine(curveCatmullRomOpen.alpha(catmullRomAlpha), scale)
  const spans = runs.map(({ first, count, measured }) => {
    // The run's points, from the one before its first segment to the one after its last.
    const points = Array.from({ length: count + 3 }, (_, pointIndex) => entries.at((first - 1 + pointIndex) % entries.length) as Entry)
    return { path: line(points) ?? '', measured }
  })
  return { path, spans }
}

export interface ShapePoint extends ScreenPoint {
  readonly direction: Direction
  readonly degrees: number
}

/** Where a direction's point lies at a distance from the centre, in SVG units. */
export const directionPoint = (direction: Direction, distance: number): ScreenPoint => screenPoint(turnOf(direction), distance)

export function shapePoints(shape: EyeMeasure, scale: RadialScale): ShapePoint[] {
  return entriesOf(shape).map(([direction, degrees]) => ({ direction, degrees, ...directionPoint(direction, scale(degrees)) }))
}

/** A closed outline through points given by turn and angle, for a rendered picture's border. */
export function outlinePath(points: readonly OutlinePoint[], scale: RadialScale): string {
  if (points.length < 2) return ''
  const line = lineRadial<OutlinePoint>()
    .angle(({ turn }) => -turn)
    .radius(({ degrees }) => scale(degrees))
    .curve(curveLinearClosed)
  return line([...points]) ?? ''
}

export interface Ring {
  readonly degrees: number
  readonly radius: number
  /** Every third ring is drawn stronger and labelled. */
  readonly major: boolean
}

/** A ring every `stepDegrees` out to `reach`. */
export function ringsOf(reach: number, scale: RadialScale, stepDegrees = ringStepDegrees): Ring[] {
  return Array.from({ length: Math.floor(reach / stepDegrees) }, (_, ringIndex) => {
    const degrees = (ringIndex + 1) * stepDegrees
    return { degrees, radius: scale(degrees), major: degrees % 30 === 0 }
  })
}

export interface Spoke {
  readonly direction: Direction
  readonly end: ScreenPoint
  readonly label: ScreenPoint
}

export function spokesOf(): Spoke[] {
  return principalDirections.map((direction) => ({
    direction,
    end: directionPoint(direction, plotRadius),
    label: directionPoint(direction, plotRadius + labelGap),
  }))
}
