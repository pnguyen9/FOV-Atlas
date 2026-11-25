/**
 * What the measuring eye sees, as coloured triangles of directions: the still line, the dot to
 * look at, the ring that fills while the wearer gets ready, and the targets with their rings. The
 * other eye sees nothing once the questions start.
 *
 * The dot, the line and the ready ring move with the head (head frame), so turning the head toward
 * a target changes nothing about what is being judged. The targets stay where they hang in the
 * room (room frame); the renderer turns each frame into the view with its own matrix, so neither
 * is rebuilt when the head moves. Each part is rebuilt only when what it shows changes.
 *
 * The line is a short straight line across its direction: a stretch of the great circle through
 * the probed point, perpendicular to the way from straight ahead to it. Being straight, it lies
 * flat along a straight picture edge it meets. Its centre sits at the probed angle from straight
 * ahead, which is the angle stored; its ends lie slightly further out.
 */

import { ringFill, type AnswerTarget, type HoldState, type TargetAction } from './answerTargets.ts'
import { degreesOf, radians } from './ceiling.ts'
import { added, cross, dot, headDirection, lengthOf, normalized, scaled, straightAhead, upward, type Vector3 } from './headFrame.ts'
import type { Probe } from './measureSession.ts'
import { turnOf } from './radarGeometry.ts'
import { directions } from './submission.ts'

export const sceneLook = {
  /** The line covers this many degrees of turn on each side of its direction, its direction's own share. */
  lineHalfTurn: 180 / directions.length,
  /** Close to straight ahead that share is short, so the line never gets shorter than twice this, in degrees. */
  minimumLineHalfLength: 10,
  /** Across the line, in degrees: wide enough to catch the eye at the edge of what it sees. */
  lineThickness: 0.6,
  dotRadius: 0.25,
  readyRingRadius: 1.6,
  readyRingThickness: 0.35,
  /** Around each target, its ring sits at the target's own radius. */
  ringThickness: 0.6,
  /** The symbol's size inside a ring, as a share of the ring's radius. */
  symbolShare: 0.42,
  symbolThickness: 0.5,
  /** Where a message sits: its centre this many degrees above the dot, this many degrees wide. */
  messageAbove: 14,
  messageWidth: 44,
} as const

type Colour = readonly [number, number, number]
const colours = {
  line: [1, 1, 1],
  dot: [0.85, 0.85, 0.85],
  ring: [0.3, 0.3, 0.3],
  fill: [0.43, 0.61, 1],
  yes: [0.35, 0.85, 0.45],
  no: [0.95, 0.4, 0.4],
  back: [0.85, 0.85, 0.85],
  'head-pointing': [0.43, 0.61, 1],
} as const satisfies Record<string, Colour>

/**
 * A list of triangle corners, three numbers of position and three of colour each, kept in typed
 * arrays that are reused and only grow. `version` changes whenever the corners do.
 */
export class Mesh {
  positions = new Float32Array(3 * 256)
  colours = new Float32Array(3 * 256)
  count = 0
  version = 0

  begin(): void {
    this.count = 0
  }

  corner(position: Vector3, colour: Colour): void {
    if ((this.count + 1) * 3 > this.positions.length) this.grow()
    const offset = this.count * 3
    this.positions.set([position.right, position.up, position.back], offset)
    this.colours.set(colour, offset)
    this.count += 1
  }

  end(): void {
    this.version += 1
  }

  private grow(): void {
    const [positions, colours] = [new Float32Array(this.positions.length * 2), new Float32Array(this.colours.length * 2)]
    positions.set(this.positions)
    colours.set(this.colours)
    this.positions = positions
    this.colours = colours
  }
}

/** Two perpendicular unit directions across `centre`: its own up, and its own left. */
interface Basis {
  readonly centre: Vector3
  readonly up: Vector3
  readonly left: Vector3
}

const headBasis: Basis = { centre: straightAhead, up: upward, left: { right: -1, up: 0, back: 0 } }

/**
 * A basis around `centre` whose up leans toward `leaningUp`; with `centre` along it, straight
 * ahead takes its place, and with `centre` along both, any direction across it does.
 */
export function basisAround(centre: Vector3, leaningUp: Vector3): Basis {
  const across = (toward: Vector3): Vector3 => added(toward, scaled(centre, -dot(toward, centre)))
  const leaning = [across(leaningUp), across(straightAhead)].find((candidate) => lengthOf(candidate) > 1e-6)
  const up = normalized(leaning ?? { right: 1, up: 0, back: 0 })
  return { centre, up, left: cross(up, centre) }
}

/** The direction `away` degrees from the basis centre, turned `turn` degrees from its up toward its left. */
function aroundPoint(basis: Basis, away: number, turn: number): Vector3 {
  const [awayRadians, turnRadians] = [radians(away), radians(turn)]
  return added(
    scaled(basis.centre, Math.cos(awayRadians)),
    scaled(basis.up, Math.cos(turnRadians) * Math.sin(awayRadians)),
    scaled(basis.left, Math.sin(turnRadians) * Math.sin(awayRadians)),
  )
}

/** The point on the plane touching the basis centre, given in degrees right and up of it. */
function onPlane(basis: Basis, right: number, up: number): Vector3 {
  return normalized(added(basis.centre, scaled(basis.left, -Math.tan(radians(right))), scaled(basis.up, Math.tan(radians(up)))))
}

function quad(mesh: Mesh, first: Vector3, second: Vector3, third: Vector3, fourth: Vector3, colour: Colour): void {
  mesh.corner(first, colour)
  mesh.corner(second, colour)
  mesh.corner(third, colour)
  mesh.corner(first, colour)
  mesh.corner(third, colour)
  mesh.corner(fourth, colour)
}

/** The part of the ring between two distances from the basis centre, from one turn to another. */
function band(mesh: Mesh, basis: Basis, inner: number, outer: number, fromTurn: number, toTurn: number, colour: Colour): void {
  const pieces = Math.max(1, Math.ceil(Math.abs(toTurn - fromTurn) / 5))
  for (let piece = 0; piece < pieces; piece += 1) {
    const start = fromTurn + ((toTurn - fromTurn) * piece) / pieces
    const end = fromTurn + ((toTurn - fromTurn) * (piece + 1)) / pieces
    quad(mesh, aroundPoint(basis, inner, start), aroundPoint(basis, outer, start), aroundPoint(basis, outer, end), aroundPoint(basis, inner, end), colour)
  }
}

type PlanePoint = readonly [number, number]

/** A straight stroke on the plane touching the basis centre, between two points given in degrees right and up of it. */
function stroke(mesh: Mesh, basis: Basis, from: PlanePoint, to: PlanePoint, colour: Colour): void {
  const [deltaRight, deltaUp] = [to[0] - from[0], to[1] - from[1]]
  const length = Math.hypot(deltaRight, deltaUp)
  const half = sceneLook.symbolThickness / 2
  const [acrossRight, acrossUp] = [(-deltaUp / length) * half, (deltaRight / length) * half]
  quad(
    mesh,
    onPlane(basis, from[0] + acrossRight, from[1] + acrossUp),
    onPlane(basis, from[0] - acrossRight, from[1] - acrossUp),
    onPlane(basis, to[0] - acrossRight, to[1] - acrossUp),
    onPlane(basis, to[0] + acrossRight, to[1] + acrossUp),
    colour,
  )
}

/** Half the line's length, in degrees along it, at `angle` degrees from straight ahead. */
export function lineHalfLength(angle: number): number {
  // On the sphere, a stretch of great circle reaching `lineHalfTurn` of turn either side of a point
  // `angle` degrees out has tan(half length) = tan(half turn) · sin(angle).
  const shareHalf = degreesOf(Math.atan(Math.tan(radians(sceneLook.lineHalfTurn)) * Math.sin(radians(angle))))
  return Math.max(shareHalf, sceneLook.minimumLineHalfLength)
}

/** The line across the probed direction, as one quad: a great circle looks straight in every view. */
function line(mesh: Mesh, probe: Probe): void {
  const turn = degreesOf(turnOf(probe.direction))
  const centre = headDirection(turn, probe.angle)
  // Along the line: the way the turn grows. Radial: across the line, toward or away from straight ahead.
  const along = headDirection(turn + 90, 90)
  const radial = cross(along, centre)
  const halfLength = radians(lineHalfLength(probe.angle))
  const halfThickness = Math.tan(radians(sceneLook.lineThickness / 2))
  const end = (side: number, across: number): Vector3 =>
    normalized(added(scaled(centre, Math.cos(halfLength)), scaled(along, side * Math.sin(halfLength)), scaled(radial, across * halfThickness)))
  quad(mesh, end(-1, -1), end(-1, 1), end(1, 1), end(1, -1), colours.line)
}

const symbolStrokes: Readonly<Record<TargetAction, readonly (readonly [PlanePoint, PlanePoint])[]>> = {
  yes: [
    [
      [-1, 0],
      [-0.3, -0.8],
    ],
    [
      [-0.3, -0.8],
      [1, 0.9],
    ],
  ],
  no: [
    [
      [-0.8, -0.8],
      [0.8, 0.8],
    ],
    [
      [-0.8, 0.8],
      [0.8, -0.8],
    ],
  ],
  // An arrow pointing left: back one answer.
  back: [
    [
      [1, 0],
      [-0.9, 0],
    ],
    [
      [-0.2, 0.7],
      [-0.9, 0],
    ],
    [
      [-0.2, -0.7],
      [-0.9, 0],
    ],
  ],
  // A downward arrow toward the chin: point with the head.
  'head-pointing': [
    [
      [0, 1],
      [0, -0.9],
    ],
    [
      [-0.7, -0.2],
      [0, -0.9],
    ],
    [
      [0.7, -0.2],
      [0, -0.9],
    ],
  ],
}

const ringBands = (inner: number, outer: number) => ({ inner, outer })
const targetRing = (target: AnswerTarget) => ringBands(target.radius - sceneLook.ringThickness, target.radius)
const readyRing = ringBands(sceneLook.readyRingRadius - sceneLook.readyRingThickness, sceneLook.readyRingRadius)

/** Fills are redrawn in steps this fine, so a ring held still is not rebuilt every frame. */
const fillSteps = 100
const fillStep = (fill: number): number => Math.round(Math.min(1, Math.max(0, fill)) * fillSteps)

/** Corners of the message's rectangle, two triangles, head frame, for a picture `aspect` times wider than high. */
export function messageCorners(aspect: number): Float32Array {
  const halfWidth = sceneLook.messageWidth / 2
  const halfHeight = halfWidth / aspect
  const centreUp = sceneLook.messageAbove
  const points: PlanePoint[] = [
    [-halfWidth, centreUp - halfHeight],
    [halfWidth, centreUp - halfHeight],
    [halfWidth, centreUp + halfHeight],
    [-halfWidth, centreUp - halfHeight],
    [halfWidth, centreUp + halfHeight],
    [-halfWidth, centreUp + halfHeight],
  ]
  const corners = new Float32Array(points.length * 3)
  points.forEach(([right, up], cornerIndex) => {
    const point = onPlane(headBasis, right, up)
    corners.set([point.right, point.up, point.back], cornerIndex * 3)
  })
  return corners
}

/** The scene's parts, each rebuilt only when what it shows changes. */
export class MeasureScene {
  /** The dot and the line, in the head frame. */
  readonly head = new Mesh()
  /** The ring around the dot while getting ready, in the head frame. */
  readonly ready = new Mesh()
  /** The targets, in the room frame. */
  readonly room = new Mesh()
  /** The filled part of a target's ring, in the room frame. */
  readonly fill = new Mesh()

  private shownProbe: Probe | null | undefined = undefined
  private shownReady: number | null | undefined = undefined
  private shownFill: string | undefined = undefined
  private targets: readonly AnswerTarget[] = []

  /** Shows the line at the probe, or the dot alone. */
  showProbe(probe: Probe | null): void {
    const shown = this.shownProbe
    if (shown !== undefined && (shown === probe || (shown !== null && probe !== null && shown.direction === probe.direction && shown.angle === probe.angle))) return
    this.shownProbe = probe
    this.head.begin()
    band(this.head, headBasis, 0, sceneLook.dotRadius, 0, 360, colours.dot)
    if (probe !== null) line(this.head, probe)
    this.head.end()
  }

  /** Shows the ring around the dot filled to `fill`, or no ring. */
  showReady(fill: number | null): void {
    const step = fill === null ? null : fillStep(fill)
    if (step === this.shownReady) return
    this.shownReady = step
    this.ready.begin()
    if (step !== null) {
      band(this.ready, headBasis, readyRing.inner, readyRing.outer, 0, 360, colours.ring)
      if (step > 0) band(this.ready, headBasis, readyRing.inner, readyRing.outer, 0, (-360 * step) / fillSteps, colours.fill)
    }
    this.ready.end()
  }

  /** Hangs the targets in the room, replacing any before. */
  placeTargets(targets: readonly AnswerTarget[]): void {
    this.targets = targets
    this.room.begin()
    for (const target of targets) {
      const basis = basisAround(target.direction, upward)
      const ring = targetRing(target)
      band(this.room, basis, ring.inner, ring.outer, 0, 360, colours.ring)
      for (const [from, to] of symbolStrokes[target.action]) {
        const size = sceneLook.symbolShare * target.radius
        stroke(this.room, basis, [from[0] * size, from[1] * size], [to[0] * size, to[1] * size], colours[target.action])
      }
    }
    this.room.end()
    this.shownFill = undefined
    this.showHold(null)
  }

  /** Fills the ring of the target being held. */
  showHold(hold: HoldState | null): void {
    const target = hold === null ? undefined : this.targets.find((candidate) => candidate.action === hold.action)
    const step = hold === null || target === undefined ? 0 : fillStep(ringFill(hold, target.action))
    const key = target === undefined || step === 0 ? 'empty' : `${target.action}:${String(step)}`
    if (key === this.shownFill) return
    this.shownFill = key
    this.fill.begin()
    if (target !== undefined && step > 0) {
      const ring = targetRing(target)
      band(this.fill, basisAround(target.direction, upward), ring.inner, ring.outer, 0, (-360 * step) / fillSteps, colours.fill)
    }
    this.fill.end()
  }
}
