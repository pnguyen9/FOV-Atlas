import { describe, expect, it } from 'vitest'
import { answerTargets, headPointingTarget, restingHold, targetLayout } from '../../src/lib/answerTargets'
import { degreesOf } from '../../src/lib/ceiling'
import { angleBetween, cross, dot, headDirection, identity, normalized, straightAhead, upward, type Vector3 } from '../../src/lib/headFrame'
import { basisAround, lineHalfLength, MeasureScene, Mesh, messageCorners, sceneLook } from '../../src/lib/measureScene'
import { turnOf } from '../../src/lib/radarGeometry'

function cornersOf(mesh: Mesh): { position: Vector3; colour: number[] }[] {
  return Array.from({ length: mesh.count }, (_, corner) => ({
    position: {
      right: mesh.positions[corner * 3] ?? Number.NaN,
      up: mesh.positions[corner * 3 + 1] ?? Number.NaN,
      back: mesh.positions[corner * 3 + 2] ?? Number.NaN,
    },
    colour: Array.from(mesh.colours.slice(corner * 3, corner * 3 + 3)),
  }))
}

const white = [1, 1, 1]
const lineCorners = (mesh: Mesh) => cornersOf(mesh).filter((corner) => corner.colour.every((value, index) => value === white.at(index)))

describe('the dot and the line', () => {
  it('draws the dot alone when there is nothing to ask', () => {
    const scene = new MeasureScene()
    scene.showProbe(null)
    expect(scene.head.count % 3).toBe(0)
    expect(cornersOf(scene.head).every((corner) => angleBetween(corner.position, straightAhead) <= sceneLook.dotRadius + 0.05)).toBe(true)
  })

  it('draws a straight line across its direction, centred on it at the probed angle', () => {
    const scene = new MeasureScene()
    scene.showProbe({ eye: 'left', direction: 'left', angle: 50 })
    const line = lineCorners(scene.head)
    expect(line).toHaveLength(6)
    const centre = headDirection(90, 50)
    const halfThickness = sceneLook.lineThickness / 2
    for (const { position } of line) {
      const unit = normalized(position)
      // Straight: every corner lies within half the thickness of one great circle through the centre.
      const across = cross(centre, headDirection(180, 90))
      expect(Math.abs(degreesOf(Math.asin(dot(unit, normalized(across)))))).toBeLessThan(halfThickness + 1e-4)
      // On the left, never nearer straight ahead than the centre (less half the thickness).
      expect(unit.right).toBeLessThan(0)
      expect(angleBetween(unit, straightAhead)).toBeGreaterThan(50 - halfThickness - 1e-4)
    }
    // Its ends lie a little further out than its centre.
    const furthest = Math.max(...line.map(({ position }) => angleBetween(normalized(position), straightAhead)))
    expect(furthest).toBeGreaterThan(50 + halfThickness)
    expect(furthest).toBeLessThan(52)
  })

  it('spans its direction’s share of turn far out, and never gets shorter than twice the minimum near straight ahead', () => {
    expect(lineHalfLength(90)).toBeCloseTo(sceneLook.lineHalfTurn, 6)
    expect(lineHalfLength(80)).toBeGreaterThan(sceneLook.minimumLineHalfLength)
    expect(lineHalfLength(5)).toBe(sceneLook.minimumLineHalfLength)
    const scene = new MeasureScene()
    scene.showProbe({ eye: 'right', direction: 'up-up-left', angle: 70 })
    const turns = lineCorners(scene.head).map(({ position }) => {
      const unit = normalized(position)
      return degreesOf(Math.atan2(-unit.right, unit.up))
    })
    const turn = degreesOf(turnOf('up-up-left'))
    expect(Math.max(...turns) - turn).toBeCloseTo(sceneLook.lineHalfTurn, 0)
    expect(turn - Math.min(...turns)).toBeCloseTo(sceneLook.lineHalfTurn, 0)
  })

  it('rebuilds only when the probe changes', () => {
    const scene = new MeasureScene()
    scene.showProbe({ eye: 'left', direction: 'up', angle: 40 })
    const { version } = scene.head
    scene.showProbe({ eye: 'left', direction: 'up', angle: 40 })
    expect(scene.head.version).toBe(version)
    scene.showProbe({ eye: 'left', direction: 'up', angle: 30 })
    expect(scene.head.version).toBe(version + 1)
    scene.showProbe(null)
    scene.showProbe(null)
    expect(scene.head.version).toBe(version + 2)
  })

  it('keeps every corner finite', () => {
    const scene = new MeasureScene()
    scene.showProbe({ eye: 'right', direction: 'down-down-right', angle: 1 })
    scene.placeTargets(answerTargets(identity))
    expect([...scene.head.positions.slice(0, scene.head.count * 3), ...scene.room.positions.slice(0, scene.room.count * 3)].every(Number.isFinite)).toBe(true)
  })
})

describe('the ready ring', () => {
  it('shows a ring around the dot that fills, and nothing when hidden', () => {
    const scene = new MeasureScene()
    scene.showReady(0)
    const empty = scene.ready.count
    expect(empty).toBeGreaterThan(0)
    scene.showReady(0.5)
    expect(scene.ready.count).toBeGreaterThan(empty)
    const { version } = scene.ready
    scene.showReady(0.501)
    expect(scene.ready.version).toBe(version)
    scene.showReady(null)
    expect(scene.ready.count).toBe(0)
  })
})

describe('the targets', () => {
  it('hangs the targets in the room frame, built once', () => {
    const scene = new MeasureScene()
    const targets = answerTargets(identity)
    scene.placeTargets(targets)
    const { version } = scene.room
    const corners = cornersOf(scene.room)
    expect(corners.some((corner) => angleBetween(normalized(corner.position), targets[0]?.direction ?? straightAhead) < targetLayout.radius + 0.1)).toBe(true)
    scene.showHold(restingHold)
    expect(scene.room.version).toBe(version)
  })

  it('fills a ring as the head holds on its target, rebuilding only that fill', () => {
    const scene = new MeasureScene()
    scene.placeTargets(answerTargets(identity))
    expect(scene.fill.count).toBe(0)
    scene.showHold({ armed: true, action: 'yes', heldSeconds: 0.5 })
    const half = scene.fill.count
    expect(half).toBeGreaterThan(0)
    const { version } = scene.fill
    scene.showHold({ armed: true, action: 'yes', heldSeconds: 0.5 })
    expect(scene.fill.version).toBe(version)
    scene.showHold({ armed: true, action: 'yes', heldSeconds: 1 })
    expect(scene.fill.count).toBeGreaterThan(half)
    scene.showHold({ armed: true, action: 'head-pointing', heldSeconds: 1 })
    expect(scene.fill.count).toBe(0)
  })

  it('draws the offer of head pointing with its own symbol', () => {
    const scene = new MeasureScene()
    scene.placeTargets([headPointingTarget(identity)])
    expect(scene.room.count).toBeGreaterThan(0)
  })
})

describe('Mesh', () => {
  it('grows to hold any number of corners', () => {
    const mesh = new Mesh()
    mesh.begin()
    for (let corner = 0; corner < 1000; corner += 1) mesh.corner(straightAhead, [1, 0, 0])
    mesh.end()
    expect(mesh.count).toBe(1000)
    expect(mesh.positions[999 * 3 + 2]).toBe(-1)
    expect(mesh.colours[999 * 3]).toBe(1)
  })
})

describe('messageCorners', () => {
  it('places the message above the dot, as wide as set', () => {
    const corners = messageCorners(4)
    expect(corners).toHaveLength(18)
    const points = Array.from({ length: 6 }, (_, corner) => ({
      right: corners[corner * 3] ?? 0,
      up: corners[corner * 3 + 1] ?? 0,
      back: corners[corner * 3 + 2] ?? 0,
    }))
    expect(points.every((point) => point.up > 0)).toBe(true)
    const across = Math.max(...points.map((point) => point.right / -point.back)) - Math.min(...points.map((point) => point.right / -point.back))
    expect(across).toBeCloseTo(2 * Math.tan((sceneLook.messageWidth / 2) * (Math.PI / 180)), 5)
  })
})

describe('basisAround', () => {
  it('leans its up toward the given up', () => {
    const basis = basisAround(straightAhead, upward)
    expect(basis.up).toEqual(upward)
    expect(basis.left.right).toBeCloseTo(-1, 9)
  })

  it('still finds a basis around a centre pointing straight up or along both references', () => {
    const aroundUp = basisAround(upward, upward)
    expect(Math.abs(aroundUp.up.back)).toBeCloseTo(1, 9)
    const aroundAhead = basisAround(straightAhead, straightAhead)
    expect(aroundAhead.up.right).toBeCloseTo(1, 9)
  })
})
