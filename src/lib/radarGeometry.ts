/**
 * Geometry of the radar chart, in SVG units around its centre (the chart's viewBox is centred on
 * 0,0). The distance from the centre is the angle from straight ahead, the same in every
 * direction: an azimuthal equidistant projection, which the "what you see" scenes share. Up is at
 * the top and the wearer's left on the left, as the wearer sees it.
 */

import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { curveCatmullRomClosed, lineRadial } from 'd3-shape'
import { directions, maximumRadialDegrees, principalDirections, type Direction, type EyeMeasure } from './submission.ts'

export const radarHalfSize = 260
export const plotRadius = 210
export const ringStepDegrees = 10
/** The smallest reach drawn, so that narrow headsets still show their proportions. */
const minimumReachDegrees = 70
const tickHalfLength = 11
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

export interface ShapePoint extends ScreenPoint {
  readonly direction: Direction
  readonly degrees: number
}

export function shapePoints(shape: EyeMeasure, scale: RadialScale): ShapePoint[] {
  return entriesOf(shape).map(([direction, degrees]) => ({ direction, degrees, ...screenPoint(turnOf(direction), scale(degrees)) }))
}

export interface Tick {
  readonly direction: Direction
  readonly degrees: number
  readonly start: ScreenPoint
  readonly end: ScreenPoint
}

/** A short mark across the spoke at each angle given, for the rendered ceiling's edges. */
export function ceilingTicks(edges: EyeMeasure, scale: RadialScale): Tick[] {
  return entriesOf(edges).map(([direction, degrees]) => {
    const turn = turnOf(direction)
    const centre = screenPoint(turn, scale(degrees))
    const alongX = Math.cos(turn) * tickHalfLength
    const alongY = -Math.sin(turn) * tickHalfLength
    return {
      direction,
      degrees,
      start: { screenX: centre.screenX - alongX, screenY: centre.screenY - alongY },
      end: { screenX: centre.screenX + alongX, screenY: centre.screenY + alongY },
    }
  })
}

export interface Ring {
  readonly degrees: number
  readonly radius: number
  /** Every third ring is drawn stronger and labelled. */
  readonly major: boolean
}

export function ringsOf(reach: number, scale: RadialScale): Ring[] {
  return Array.from({ length: Math.floor(reach / ringStepDegrees) }, (_, ringIndex) => {
    const degrees = (ringIndex + 1) * ringStepDegrees
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
