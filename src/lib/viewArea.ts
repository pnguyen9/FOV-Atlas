/**
 * How much of the space around the head a measure sees, as a share of the half sphere in front.
 *
 * A width or a height reads one line across the view; the area reads the whole outline, so a view
 * that is wider but shorter can come out smaller, and the area picks the highest measure of the
 * tools that have one (`measureRanking.ts`). It is worked out for the tools that measure
 * many directions per eye from straight ahead of the head (FOV Atlas and WIMFOV): VR Headset
 * Picker measures from the centre of each picture and TestHMD both eyes at once, so neither
 * draws an outline of each eye in one frame.
 *
 * Each outline gives, along each measured direction, the angle from straight ahead. Between two
 * neighbouring measured directions the angle changes in a straight line with the turn around the
 * centre, and the solid angle inside is the integral of 1 − cos(angle) over the turn, worked out
 * exactly on each stretch.
 */

import { radians } from './ceiling.ts'
import { angleOriginOf, directions, measuresBothEyesAtOnce, turnAt, type EyeMeasure, type EyeMeasures, type Tool } from './submission.ts'

/** Whether the tool's measures carry an area: each eye outlined from straight ahead of the head. */
export const hasViewArea = (tool: Tool): boolean => angleOriginOf(tool) === 'head' && !measuresBothEyesAtOnce(tool)

type BothEyes = 'union' | 'overlap'

/**
 * The shapes either eye (union: the farther of the two) and both eyes at once (overlap: the
 * nearer) see, from the directions measured on both eyes only: an angle one eye alone has says
 * nothing about the other eye.
 */
function bothEyesShapes({ left, right }: EyeMeasures): Readonly<Record<BothEyes, EyeMeasure>> {
  const leftAngles = new Map(Object.entries(left))
  const rightAngles = new Map(Object.entries(right))
  const union: [string, number][] = []
  const overlap: [string, number][] = []
  for (const direction of directions) {
    const leftDegrees = leftAngles.get(direction)
    const rightDegrees = rightAngles.get(direction)
    if (leftDegrees === undefined || rightDegrees === undefined) continue
    union.push([direction, Math.max(leftDegrees, rightDegrees)])
    overlap.push([direction, Math.min(leftDegrees, rightDegrees)])
  }
  return { union: Object.fromEntries(union), overlap: Object.fromEntries(overlap) }
}

/** The union or the overlap shape (see `bothEyesShapes`). */
export function bothEyesShape(measures: EyeMeasures, combine: BothEyes): EyeMeasure {
  const { union, overlap } = bothEyesShapes(measures)
  return combine === 'union' ? union : overlap
}

/** ∫ (1 − cos r) dφ over a turn `span` while r goes in a straight line from `from` to `to`, in radians. */
function stretchArea(span: number, from: number, to: number): number {
  const change = to - from
  // Below this the exact form loses its digits to cancellation; the midpoint is exact to well past them.
  if (Math.abs(change) < 1e-6) return span * (1 - Math.cos((from + to) / 2))
  return span * (1 - (Math.sin(to) - Math.sin(from)) / change)
}

/** The solid angle inside an outline, in steradians; undefined below three measured directions. */
export function solidAngleOf(shape: EyeMeasure): number | undefined {
  const angles = new Map(Object.entries(shape))
  const points = directions.flatMap((direction, directionIndex) => {
    const degrees = angles.get(direction)
    return degrees === undefined ? [] : [{ turn: turnAt(directionIndex), reach: radians(degrees) }]
  })
  if (points.length < 3) return undefined
  return points.reduce((total, point, pointIndex) => {
    const next = points[(pointIndex + 1) % points.length] ?? point
    const span = (next.turn - point.turn + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI
    return total + stretchArea(span, point.reach, next.reach)
  }, 0)
}

/** A solid angle as a share of the half sphere in front (2π steradians), in percent, to a hundredth. */
export function halfSphereShare(steradians: number): number {
  return Math.round((steradians / (2 * Math.PI)) * 10_000) / 100
}

const shareOf = (shape: EyeMeasure): number | undefined => {
  const steradians = solidAngleOf(shape)
  return steradians === undefined ? undefined : halfSphereShare(steradians)
}

/** The area either eye and both eyes at once see, in percent of the half sphere (see `halfSphereShare`). */
export function viewAreasOf(measures: EyeMeasures): { readonly area: number | undefined; readonly overlapArea: number | undefined } {
  const { union, overlap } = bothEyesShapes(measures)
  return { area: shareOf(union), overlapArea: shareOf(overlap) }
}
