/**
 * What a headset reports it draws for each eye, read from WebXR while measuring: each view's
 * projection matrix gives how far the picture reaches across its own plane (hmdq's left, right,
 * bottom and top tangents), and the view's rotation relative to the head gives how far that
 * picture is turned.
 *
 * Everything is turned into angles from straight ahead of the head, the starting point FOV Atlas
 * measures and stores from, by following each direction outward from straight ahead until it
 * leaves the picture. Up and down edges therefore start straight ahead of the head, not at the
 * picture's centre; `pictureVertical` in `ceiling.ts` turns them back.
 */

import { degreesOf, roundCenti } from './ceiling.ts'
import {
  conjugate,
  headDirection,
  multiply,
  rotate,
  straightAhead,
  yawOf,
  type Quaternion,
  type Vector3,
} from './headFrame.ts'
import { turnOf } from './radarGeometry.ts'
import { ceilingProblem, type Ceiling, type Direction, type EdgeAngles, type Eye } from './submission.ts'

/** How far the picture reaches across its own plane, one unit in front of the eye; left and down are negative. */
export interface ViewTangents {
  readonly left: number
  readonly right: number
  readonly down: number
  readonly up: number
}

export interface RenderedView {
  readonly eye: Eye
  readonly tangents: ViewTangents
  /** The view's rotation relative to the head. */
  readonly orientation: Quaternion
}

/** Entries of a column-major WebGL matrix that a projection without skew or shift along the axis keeps at these values. */
const fixedEntries: readonly (readonly [number, number])[] = [
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],
  [6, 0],
  [7, 0],
  [11, -1],
  [12, 0],
  [13, 0],
  [15, 0],
]
const matrixTolerance = 1e-6

/**
 * The picture's tangents from a WebGL projection matrix (column-major, as WebXR gives it), or
 * null for anything that isn't a perspective projection looking along -z.
 */
export function tangentsOfProjection(matrix: ArrayLike<number>): ViewTangents | null {
  if (matrix.length !== 16) return null
  const entries = Array.from(matrix)
  if (!entries.every((entry) => Number.isFinite(entry))) return null
  if (fixedEntries.some(([index, expected]) => Math.abs((entries.at(index) ?? Number.NaN) - expected) > matrixTolerance)) return null
  const [horizontalScale = 0, verticalScale = 0, horizontalShift = 0, verticalShift = 0] = [0, 5, 8, 9].map((index) => entries.at(index))
  if (horizontalScale <= 0 || verticalScale <= 0) return null
  return {
    left: (horizontalShift - 1) / horizontalScale,
    right: (horizontalShift + 1) / horizontalScale,
    down: (verticalShift - 1) / verticalScale,
    up: (verticalShift + 1) / verticalScale,
  }
}

/** The view's rotation relative to the head, from both poses' orientations in the same space. */
export const relativeOrientation = (head: Quaternion, view: Quaternion): Quaternion => multiply(conjugate(head), view)

/** Whether a head-frame direction falls on the view's picture; its border counts as on it. */
export function isOnPicture(view: RenderedView, direction: Vector3): boolean {
  const seen = rotate(conjugate(view.orientation), direction)
  if (seen.back >= 0) return false
  const [across, upward] = [seen.right / -seen.back, seen.up / -seen.back]
  const { tangents } = view
  return across >= tangents.left && across <= tangents.right && upward >= tangents.down && upward <= tangents.up
}

const halvings = 48

/**
 * How far from straight ahead of the head the picture reaches toward the direction turned `turn`
 * degrees from up, in degrees: 0 when straight ahead itself is off the picture. A picture is a
 * convex cone around the eye, so along any direction it is one stretch starting straight ahead,
 * found by halving.
 */
export function reachAlong(view: RenderedView, turn: number): number {
  if (!isOnPicture(view, straightAhead)) return 0
  let [inside, outside] = [0, 180]
  for (let halving = 0; halving < halvings; halving += 1) {
    const middle = (inside + outside) / 2
    if (isOnPicture(view, headDirection(turn, middle))) inside = middle
    else outside = middle
  }
  return inside
}

/** Rounded down to hundredths: a stored edge never claims more than the headset draws. */
// WebXR hands matrices over in single precision, a few millionths of a degree off.
const centiFloor = (degrees: number): number => Math.floor(degrees * 100 + 1e-3) / 100

export const reachToward = (view: RenderedView, direction: Direction): number => centiFloor(reachAlong(view, degreesOf(turnOf(direction))))

export function edgesOf(view: RenderedView): EdgeAngles {
  return {
    left: reachToward(view, 'left'),
    right: reachToward(view, 'right'),
    up: reachToward(view, 'up'),
    down: reachToward(view, 'down'),
  }
}

/** How far the view's picture is turned away from the nose, in degrees. */
export function outwardTurn(view: RenderedView): number {
  const yaw = yawOf(view.orientation)
  return view.eye === 'left' ? yaw : -yaw
}

export type RenderedReadResult =
  | { readonly ok: true; readonly left: RenderedView; readonly right: RenderedView; readonly ceiling: Ceiling }
  | { readonly ok: false; readonly error: 'views-missing' | 'projection-unreadable' | 'ceiling-out-of-range' }

export interface ViewReading {
  readonly eye: string
  readonly projectionMatrix: ArrayLike<number>
  /** The view's rotation relative to the head. */
  readonly orientation: Quaternion
}

/**
 * Both eyes' pictures and the measure's own rendered field of view, from the views of one frame.
 * Each eye's edges are read with its own turn; the stored turn is the two eyes' average, which
 * is what the radar outline is drawn with.
 */
export function readRenderedViews(readings: readonly ViewReading[]): RenderedReadResult {
  const leftReading = readings.find((reading) => reading.eye === 'left')
  const rightReading = readings.find((reading) => reading.eye === 'right')
  if (readings.length !== 2 || leftReading === undefined || rightReading === undefined) return { ok: false, error: 'views-missing' }
  const leftTangents = tangentsOfProjection(leftReading.projectionMatrix)
  const rightTangents = tangentsOfProjection(rightReading.projectionMatrix)
  if (leftTangents === null || rightTangents === null) return { ok: false, error: 'projection-unreadable' }
  const left: RenderedView = { eye: 'left', tangents: leftTangents, orientation: leftReading.orientation }
  const right: RenderedView = { eye: 'right', tangents: rightTangents, orientation: rightReading.orientation }
  // Every angle is stored from straight ahead of the head, which has to lie on both pictures.
  if (!isOnPicture(left, straightAhead) || !isOnPicture(right, straightAhead)) return { ok: false, error: 'ceiling-out-of-range' }
  const ceiling: Ceiling = {
    source: 'measured',
    left: edgesOf(left),
    right: edgesOf(right),
    canting: roundCenti((outwardTurn(left) + outwardTurn(right)) / 2),
  }
  return ceilingProblem(ceiling) === null ? { ok: true, left, right, ceiling } : { ok: false, error: 'ceiling-out-of-range' }
}
