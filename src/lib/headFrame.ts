/**
 * Directions and rotations in the head frame WebXR uses: one axis to the wearer's right, one up,
 * and one backward, so straight ahead points along the negative backward axis. Rotations are unit
 * quaternions, as WebXR gives them.
 */

import { degreesOf, radians } from './ceiling.ts'

export interface Vector3 {
  readonly right: number
  readonly up: number
  readonly back: number
}

/** A unit quaternion: its vector part along the same axes as `Vector3`, and its scalar part. */
export interface Quaternion {
  readonly vector: Vector3
  readonly scalar: number
}

/** An orientation as WebXR gives it, in a `DOMPointReadOnly`. */
export interface DomQuaternion {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly w: number
}

export const quaternionOf = (point: DomQuaternion): Quaternion => ({
  vector: { right: point.x, up: point.y, back: point.z },
  scalar: point.w,
})

export const identity: Quaternion = { vector: { right: 0, up: 0, back: 0 }, scalar: 1 }
export const straightAhead: Vector3 = { right: 0, up: 0, back: -1 }
export const upward: Vector3 = { right: 0, up: 1, back: 0 }

export const scaled = (vector: Vector3, factor: number): Vector3 => ({
  right: vector.right * factor,
  up: vector.up * factor,
  back: vector.back * factor,
})

export const added = (...vectors: Vector3[]): Vector3 =>
  vectors.reduce(
    (sum, vector) => ({ right: sum.right + vector.right, up: sum.up + vector.up, back: sum.back + vector.back }),
    { right: 0, up: 0, back: 0 },
  )

export const lengthOf = (vector: Vector3): number => Math.hypot(vector.right, vector.up, vector.back)
export const normalized = (vector: Vector3): Vector3 => scaled(vector, 1 / lengthOf(vector))

export const cross = (first: Vector3, second: Vector3): Vector3 => ({
  right: first.up * second.back - first.back * second.up,
  up: first.back * second.right - first.right * second.back,
  back: first.right * second.up - first.up * second.right,
})

export const dot = (first: Vector3, second: Vector3): number =>
  first.right * second.right + first.up * second.up + first.back * second.back

export const conjugate = (rotation: Quaternion): Quaternion => ({ vector: scaled(rotation.vector, -1), scalar: rotation.scalar })

/** The rotation `second` followed by `first`, as `first * second`. */
export function multiply(first: Quaternion, second: Quaternion): Quaternion {
  return {
    vector: added(scaled(second.vector, first.scalar), scaled(first.vector, second.scalar), cross(first.vector, second.vector)),
    scalar: first.scalar * second.scalar - dot(first.vector, second.vector),
  }
}

export function rotate(rotation: Quaternion, vector: Vector3): Vector3 {
  const doubled = scaled(cross(rotation.vector, vector), 2)
  return added(vector, scaled(doubled, rotation.scalar), cross(rotation.vector, doubled))
}

/** A rotation about the vertical axis; positive turns straight ahead toward the wearer's left. */
export function yawRotation(degrees: number): Quaternion {
  const half = radians(degrees) / 2
  return { vector: scaled(upward, Math.sin(half)), scalar: Math.cos(half) }
}

/** The angle between two unit vectors, in degrees. */
export const angleBetween = (first: Vector3, second: Vector3): number =>
  degreesOf(Math.acos(Math.min(1, Math.max(-1, dot(first, second)))))

/** How far a rotation turns straight ahead toward the wearer's left, in degrees, ignoring any tilt. */
export function yawOf(rotation: Quaternion): number {
  const forward = rotate(rotation, straightAhead)
  return degreesOf(Math.atan2(-forward.right, -forward.back))
}

/** How far a rotation raises straight ahead above level, in degrees; negative below. */
export function pitchOf(rotation: Quaternion): number {
  return degreesOf(Math.asin(Math.min(1, Math.max(-1, rotate(rotation, straightAhead).up))))
}

/** The head-frame unit vector `angle` degrees from straight ahead, toward the direction turned `turn` degrees from up. */
export function headDirection(turn: number, angle: number): Vector3 {
  const [turned, away] = [radians(turn), radians(angle)]
  return {
    right: -Math.sin(turned) * Math.sin(away),
    up: Math.cos(turned) * Math.sin(away),
    back: -Math.cos(away),
  }
}

/** A unit vector turned `yaw` degrees toward the left and `pitch` degrees up from straight ahead. */
export function yawPitchDirection(yaw: number, pitch: number): Vector3 {
  const [turned, raised] = [radians(yaw), radians(pitch)]
  return {
    right: -Math.sin(turned) * Math.cos(raised),
    up: Math.sin(raised),
    back: -Math.cos(turned) * Math.cos(raised),
  }
}
