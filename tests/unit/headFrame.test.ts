import { describe, expect, it } from 'vitest'
import {
  angleBetween,
  conjugate,
  headDirection,
  identity,
  multiply,
  pitchOf,
  quaternionOf,
  rotate,
  straightAhead,
  upward,
  yawOf,
  yawPitchDirection,
  yawRotation,
  type Vector3,
} from '../../src/lib/headFrame'
import { degreesOf, radians } from '../../src/lib/ceiling'
import { turnOf, type Direction } from '../../src/lib/submission'
import { domPoint } from './xrFixtures'

const expectVector = (actual: Vector3, expected: Vector3): void => {
  expect(actual.right).toBeCloseTo(expected.right, 9)
  expect(actual.up).toBeCloseTo(expected.up, 9)
  expect(actual.back).toBeCloseTo(expected.back, 9)
}

describe('rotations', () => {
  it('turns straight ahead toward the left for a positive yaw', () => {
    expectVector(rotate(yawRotation(90), straightAhead), { right: -1, up: 0, back: 0 })
    expect(yawOf(yawRotation(30))).toBeCloseTo(30, 9)
    expect(yawOf(yawRotation(-12.5))).toBeCloseTo(-12.5, 9)
  })

  it('combines rotations, the second applied first', () => {
    expect(yawOf(multiply(yawRotation(20), yawRotation(15)))).toBeCloseTo(35, 9)
    expect(yawOf(multiply(conjugate(yawRotation(20)), yawRotation(15)))).toBeCloseTo(-5, 9)
    expectVector(rotate(identity, { right: 0.3, up: 0.4, back: -0.5 }), { right: 0.3, up: 0.4, back: -0.5 })
  })

  it('reads WebXR orientations', () => {
    const rotation = yawRotation(42)
    expect(quaternionOf(domPoint(rotation))).toEqual(rotation)
  })

  it('ignores tilt when reading the yaw', () => {
    const tilt = { vector: { right: Math.sin(0.1), up: 0, back: 0 }, scalar: Math.cos(0.1) }
    expect(yawOf(multiply(yawRotation(25), tilt))).toBeCloseTo(25, 9)
  })
})

describe('directions', () => {
  it('turns from up toward the left, like the radar', () => {
    const toward = (direction: Direction): Vector3 => headDirection(degreesOf(turnOf(direction)), 90)
    expectVector(toward('up'), upward)
    expectVector(toward('left'), { right: -1, up: 0, back: 0 })
    expectVector(toward('down'), { right: 0, up: -1, back: 0 })
    expectVector(toward('right'), { right: 1, up: 0, back: 0 })
  })

  it('tells how far the head looks up or down', () => {
    const raised = { vector: { right: Math.sin(radians(15)), up: 0, back: 0 }, scalar: Math.cos(radians(15)) }
    expect(pitchOf(raised)).toBeCloseTo(30, 9)
    expect(pitchOf(multiply(yawRotation(70), raised))).toBeCloseTo(30, 9)
    expect(pitchOf(identity)).toBeCloseTo(0, 9)
  })

  it('places angles from straight ahead, up to straight behind', () => {
    expectVector(headDirection(0, 0), straightAhead)
    expectVector(headDirection(90, 90), { right: -1, up: 0, back: 0 })
    expectVector(headDirection(0, 90), { right: 0, up: 1, back: 0 })
    expectVector(headDirection(270, 180), { right: 0, up: 0, back: 1 })
    expect(angleBetween(headDirection(45, 37), straightAhead)).toBeCloseTo(37, 9)
  })

  it('places yaw and pitch', () => {
    expectVector(yawPitchDirection(90, 0), { right: -1, up: 0, back: 0 })
    expectVector(yawPitchDirection(0, -90), { right: 0, up: -1, back: 0 })
    expect(angleBetween(yawPitchDirection(14, -20), straightAhead)).toBeGreaterThan(20)
  })

  it('measures angles between directions, even rounding past one', () => {
    expect(angleBetween(straightAhead, straightAhead)).toBe(0)
    expect(angleBetween(straightAhead, { right: 0, up: 0, back: 1.0000001 })).toBe(180)
  })
})
