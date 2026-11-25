/**
 * Geometry of the radar chart, in SVG units around its centre (the chart's viewBox is centred on
 * 0,0). The distance from the centre is the angle from straight ahead, the same in every
 * direction: an azimuthal equidistant projection, which the "what you see" scenes share. Up is at
 * the top and the wearer's left on the left, as the wearer sees it.
 */

import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { curveCatmullRomClosed, curveLinearClosed, lineRadial } from 'd3-shape'
import type { OutlinePoint } from './ceiling.ts'
import { directions, maximumRadialDegrees, principalDirections, type Direction, type EyeMeasure } from './submission.ts'

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

/** Directions run from up toward the wearer's left, so counter-clockwise on screen. */
export const turnOf = (direction: Direction): number => (directions.indexOf(direction) * 2 * Math.PI) / directions.length

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

/** A smooth closed curve through the shape's points; empty below two points. */
export function shapePath(shape: EyeMeasure, scale: RadialScale): string {
  const entries = entriesOf(shape)
  if (entries.length < 2) return ''
  // d3 measures angles clockwise from the top, the opposite way round from the directions.
  const line = lineRadial<Entry>()
    .angle(([direction]) => -turnOf(direction))
    .radius(([, degrees]) => scale(degrees))
    .curve(curveCatmullRomClosed)
  return line(entries) ?? ''
}

/** A stretch of a shape's curve, and whether the tool measured every principal direction it passes. */
export interface CurveSpan {
  readonly path: string
  readonly measured: boolean
}

const isPrincipal = (direction: Direction): boolean => principalDirections.includes(direction)

/** Whether a principal direction lies strictly between two directions, going round from the first. */
function passesPrincipal(from: Direction, to: Direction): boolean {
  const start = directions.indexOf(from)
  const steps = (directions.indexOf(to) - start + directions.length) % directions.length || directions.length
  return Array.from({ length: steps - 1 }, (_, stepIndex) => directions[(start + stepIndex + 1) % directions.length]).some(
    (direction) => direction !== undefined && isPrincipal(direction),
  )
}

/** Whether a shape lacks any principal direction, so that part of its curve is not measured. */
export function missesPrincipal(shape: EyeMeasure): boolean {
  const measured = new Set(entriesOf(shape).map(([direction]) => direction))
  return principalDirections.some((direction) => !measured.has(direction))
}

/**
 * The curve of `shapePath` split where it changes between measured and not: a stretch passing over
 * a principal direction nobody measured only joins the points on either side. In-between
 * directions are optional, so passing over one of those counts as measured.
 */
export function shapeSpans(shape: EyeMeasure, scale: RadialScale): CurveSpan[] {
  const entries = entriesOf(shape)
  const path = shapePath(shape, scale)
  if (entries.length < 3) return path === '' ? [] : [{ path, measured: false }]
  // d3 starts the closed curve at the second point and draws one cubic per pair of neighbours.
  const [start = '', ...cubics] = path.slice(1).replace(/Z$/, '').split('C')
  let pen = start
  const pieces = cubics.map((cubic, cubicIndex) => {
    const [from] = entries[(cubicIndex + 1) % entries.length] ?? []
    const [to] = entries[(cubicIndex + 2) % entries.length] ?? []
    const piece = { from: pen, cubic, measured: from === undefined || to === undefined || !passesPrincipal(from, to) }
    pen = cubic.split(',').slice(-2).join(',')
    return piece
  })
  const firstChange = pieces.findIndex((piece, pieceIndex) => piece.measured !== pieces.at(pieceIndex - 1)?.measured)
  if (firstChange === -1) return [{ path, measured: pieces[0]?.measured ?? true }]
  const spans: { from: string; cubics: string[]; measured: boolean }[] = []
  for (const piece of [...pieces.slice(firstChange), ...pieces.slice(0, firstChange)]) {
    const current = spans.at(-1)
    if (current?.measured === piece.measured) current.cubics.push(piece.cubic)
    else spans.push({ from: piece.from, cubics: [piece.cubic], measured: piece.measured })
  }
  return spans.map(({ from, cubics: spanCubics, measured }) => ({ path: `M${from}C${spanCubics.join('C')}`, measured }))
}

export interface ShapePoint extends ScreenPoint {
  readonly direction: Direction
  readonly degrees: number
}

export function shapePoints(shape: EyeMeasure, scale: RadialScale): ShapePoint[] {
  return entriesOf(shape).map(([direction, degrees]) => ({ direction, degrees, ...screenPoint(turnOf(direction), scale(degrees)) }))
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
    end: screenPoint(turnOf(direction), plotRadius),
    label: screenPoint(turnOf(direction), plotRadius + labelGap),
  }))
}
