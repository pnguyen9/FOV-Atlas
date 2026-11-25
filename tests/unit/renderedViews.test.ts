import { describe, expect, it } from 'vitest'
import { degreesOf, isFlatPicture, pictureOutline, pictureVertical, radians } from '../../src/lib/ceiling'
import { headDirection, identity, straightAhead, yawRotation } from '../../src/lib/headFrame'
import { renderedValuesOf } from '../../src/lib/renderedAverage'
import {
  edgesOf,
  isOnPicture,
  outwardTurn,
  reachAlong,
  reachToward,
  readRenderedViews,
  relativeOrientation,
  tangentsOfProjection,
  type RenderedView,
} from '../../src/lib/renderedViews'
import { atlasSubmission } from './fixtures'
import {
  outwardRotation,
  projectionOf,
  readingsOf,
  straightHeadset,
  tangentsOf,
  turnedHeadset,
} from './xrFixtures'

const symmetric = { left: -1, right: 1, down: -1, up: 1 }

describe('tangentsOfProjection', () => {
  it('reads the tangents of a perspective projection', () => {
    const tangents = { left: -1.2, right: 0.9, down: -1.3, up: 0.95 }
    const read = tangentsOfProjection(projectionOf(tangents))
    expect(read?.left).toBeCloseTo(-1.2, 5)
    expect(read?.right).toBeCloseTo(0.9, 5)
    expect(read?.down).toBeCloseTo(-1.3, 5)
    expect(read?.up).toBeCloseTo(0.95, 5)
  })

  it('accepts a projection with no far plane', () => {
    const matrix = projectionOf(symmetric)
    matrix[10] = -1
    matrix[14] = -0.2
    expect(tangentsOfProjection(matrix)).not.toBeNull()
  })

  it.each([
    ['too short', new Float32Array(15)],
    ['too long', new Float32Array(17)],
  ])('rejects a matrix %s', (_, matrix) => {
    expect(tangentsOfProjection(matrix)).toBeNull()
  })

  it('rejects entries that are not finite', () => {
    const matrix = Array.from(projectionOf(symmetric))
    matrix[0] = Number.NaN
    expect(tangentsOfProjection(matrix)).toBeNull()
    matrix[0] = Number.POSITIVE_INFINITY
    expect(tangentsOfProjection(matrix)).toBeNull()
  })

  it.each([1, 2, 3, 4, 6, 7, 12, 13, 15])('rejects a matrix that is no perspective projection (entry %i)', (index) => {
    const matrix = projectionOf(symmetric)
    matrix.fill(0.5, index, index + 1)
    expect(tangentsOfProjection(matrix)).toBeNull()
  })

  it('rejects a projection looking the other way', () => {
    const matrix = projectionOf(symmetric)
    matrix[11] = 1
    expect(tangentsOfProjection(matrix)).toBeNull()
  })

  it.each([0, 5])('rejects a projection mirrored or flattened (entry %i)', (index) => {
    const matrix = projectionOf(symmetric)
    matrix.fill(-1, index, index + 1)
    expect(tangentsOfProjection(matrix)).toBeNull()
    matrix.fill(0, index, index + 1)
    expect(tangentsOfProjection(matrix)).toBeNull()
  })
})

const viewOf = (eye: 'left' | 'right', outer: number, inner: number, up: number, down: number, turn: number): RenderedView => ({
  eye,
  tangents: tangentsOf(outer, inner, up, down, eye),
  orientation: outwardRotation(eye, turn),
})

describe('isOnPicture', () => {
  const view = viewOf('left', 50, 40, 45, 45, 0)
  it('takes the border as part of the picture', () => {
    expect(isOnPicture({ ...view, tangents: symmetric }, headDirection(90, 45))).toBe(true)
  })

  it('leaves out anything beside or behind the eye', () => {
    expect(isOnPicture(view, headDirection(90, 51))).toBe(false)
    expect(isOnPicture(view, headDirection(270, 41))).toBe(false)
    expect(isOnPicture(view, headDirection(0, 46))).toBe(false)
    expect(isOnPicture(view, headDirection(180, 46))).toBe(false)
    expect(isOnPicture(view, headDirection(0, 120))).toBe(false)
    expect(isOnPicture(view, { right: 0, up: 0, back: 0 })).toBe(false)
  })
})

describe('reachAlong', () => {
  it('equals each half-angle of a picture that is not turned', () => {
    const view = viewOf('left', 54.8, 42, 44, 52.9, 0)
    expect(reachAlong(view, 90)).toBeCloseTo(54.8, 6)
    expect(reachAlong(view, 270)).toBeCloseTo(42, 6)
    expect(reachAlong(view, 0)).toBeCloseTo(44, 6)
    expect(reachAlong(view, 180)).toBeCloseTo(52.9, 6)
  })

  it('adds the turn toward the ear and takes it off toward the nose', () => {
    expect(reachAlong(viewOf('left', 50, 45, 45, 45, 10), 90)).toBeCloseTo(60, 6)
    expect(reachAlong(viewOf('left', 50, 45, 45, 45, 10), 270)).toBeCloseTo(35, 6)
    expect(reachAlong(viewOf('right', 50, 45, 45, 45, 10), 270)).toBeCloseTo(60, 6)
    expect(reachAlong(viewOf('right', 50, 45, 45, 45, 10), 90)).toBeCloseTo(35, 6)
  })

  it('reads up and down from straight ahead of the head, which a turned picture meets off its centre', () => {
    const view = viewOf('left', 50, 45, 45, 40, 10)
    const expectedUp = degreesOf(Math.atan(Math.tan(radians(45)) * Math.cos(radians(10))))
    expect(reachAlong(view, 0)).toBeCloseTo(expectedUp, 6)
    // `pictureVertical` turns it back to the picture's own angle, so nothing is converted twice.
    expect(pictureVertical(reachAlong(view, 0), 10)).toBeCloseTo(45, 6)
    expect(pictureVertical(reachAlong(view, 180), 10)).toBeCloseTo(40, 6)
  })

  it('reaches past a quarter turn from straight ahead for a picture turned far enough', () => {
    expect(reachAlong(viewOf('left', 85, 50, 45, 45, 40), 90)).toBeCloseTo(125, 5)
  })

  it('is nothing when straight ahead is off the picture', () => {
    expect(reachAlong(viewOf('left', 50, 5, 45, 45, 20), 90)).toBe(0)
  })

  it('rounds stored edges down to hundredths, never claiming more than drawn', () => {
    const view = viewOf('left', 54.8169, 42, 44, 52.9, 0)
    expect(reachToward(view, 'left')).toBe(54.81)
    expect(reachToward(viewOf('left', 54.8, 42, 44, 52.9, 0), 'left')).toBe(54.8)
  })
})

describe('outwardTurn and relativeOrientation', () => {
  it('reads each eye turned away from the nose as positive', () => {
    expect(outwardTurn(viewOf('left', 50, 45, 45, 45, 10))).toBeCloseTo(10, 9)
    expect(outwardTurn(viewOf('right', 50, 45, 45, 45, 10))).toBeCloseTo(10, 9)
    expect(outwardTurn(viewOf('right', 50, 45, 45, 45, -3))).toBeCloseTo(-3, 9)
  })

  it('reads a view relative to the head, wherever the head looks', () => {
    const head = yawRotation(70)
    const view = relativeOrientation(head, yawRotation(80))
    expect(outwardTurn({ eye: 'left', tangents: symmetric, orientation: view })).toBeCloseTo(10, 9)
    expect(relativeOrientation(identity, identity)).toEqual(identity)
  })
})

describe('readRenderedViews', () => {
  it('reads the rendered field of view of a headset that does not turn its pictures', () => {
    const read = readRenderedViews(readingsOf(straightHeadset))
    if (!read.ok) throw new Error(read.error)
    expect(read.ceiling).toEqual({
      source: 'measured',
      left: { left: 54.8, right: 42, up: 44, down: 52.9 },
      right: { left: 42, right: 54.8, up: 44, down: 52.9 },
      canting: 0,
    })
  })

  it('stores edges from straight ahead of the head and the turn, as the radar and averages expect', () => {
    const read = readRenderedViews(readingsOf(turnedHeadset))
    if (!read.ok || read.ceiling.source !== 'measured') throw new Error('unread')
    const { ceiling } = read
    expect(ceiling.canting).toBe(10)
    expect(ceiling.left.left).toBe(60)
    expect(ceiling.left.right).toBe(35)
    expect(ceiling.right.right).toBe(60)
    expect(isFlatPicture(ceiling.left, ceiling.canting, 'left')).toBe(true)
    // The averages turn heights back to the picture's own: 45° up and 45° down.
    const values = renderedValuesOf({ ...atlasSubmission, ceiling, tuning: { ...atlasSubmission.tuning, driverTuned: false } })
    expect(values.leftWidth).toBe(95)
    expect(values.leftHeight).toBeCloseTo(90, 1)
    expect(values.horizontal).toBe(120)
    expect(pictureOutline(ceiling.left, ceiling.canting, 'left')).not.toBeNull()
  })

  it('stores the average turn of two pictures turned differently', () => {
    const [left, right] = readingsOf(turnedHeadset)
    if (left === undefined || right === undefined) throw new Error('fixture')
    const read = readRenderedViews([left, { ...right, orientation: outwardRotation('right', 12) }])
    expect(read.ok && read.ceiling.source === 'measured' ? read.ceiling.canting : null).toBe(11)
  })

  it.each([
    ['one eye only', (readings: ReturnType<typeof readingsOf>) => readings.slice(0, 1)],
    ['the same eye twice', (readings: ReturnType<typeof readingsOf>) => [readings[0], readings[0]]],
    ['a third view', (readings: ReturnType<typeof readingsOf>) => [...readings, ...readings.slice(0, 1)]],
    ['no eye named', (readings: ReturnType<typeof readingsOf>) => readings.map((reading) => ({ ...reading, eye: 'none' }))],
  ])('refuses views with %s', (_, change) => {
    const readings = change(readingsOf(straightHeadset)).filter((reading) => reading !== undefined)
    expect(readRenderedViews(readings)).toEqual({ ok: false, error: 'views-missing' })
  })

  it('refuses a projection it cannot read', () => {
    const [left, right] = readingsOf(straightHeadset)
    if (left === undefined || right === undefined) throw new Error('fixture')
    expect(readRenderedViews([left, { ...right, projectionMatrix: new Float32Array(16) }])).toEqual({
      ok: false,
      error: 'projection-unreadable',
    })
    expect(readRenderedViews([{ ...left, projectionMatrix: new Float32Array(16) }, right])).toEqual({
      ok: false,
      error: 'projection-unreadable',
    })
  })

  it('refuses pictures no stored measure could hold', () => {
    expect(readRenderedViews(readingsOf({ ...turnedHeadset, turn: 50 }))).toEqual({ ok: false, error: 'ceiling-out-of-range' })
  })

  it('reads straight ahead off the picture as an edge at 0°', () => {
    const read = readRenderedViews(readingsOf({ outer: 50, inner: 5, up: 45, down: 45, turn: 20 }))
    expect(read.ok ? null : read.error).toBe('ceiling-out-of-range')
    expect(edgesOf(viewOf('left', 50, 5, 45, 45, 20)).right).toBe(0)
    expect(isOnPicture(viewOf('left', 50, 5, 45, 45, 20), straightAhead)).toBe(false)
  })
})
