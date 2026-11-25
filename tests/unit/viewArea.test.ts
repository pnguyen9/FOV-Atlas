import { describe, expect, it } from 'vitest'
import { directions, principalDirections, tools } from '../../src/lib/submission'
import { bothEyesShape, halfSphereShare, hasViewArea, solidAngleOf, viewAreasOf } from '../../src/lib/viewArea'

const everyDirection = (degrees: number) => Object.fromEntries(directions.map((direction) => [direction, degrees]))
const everyPrincipal = (degrees: number) => Object.fromEntries(principalDirections.map((direction) => [direction, degrees]))

describe('hasViewArea', () => {
  it('is for the tools outlining each eye from straight ahead of the head', () => {
    expect(tools.filter(hasViewArea)).toEqual(['atlas', 'wimfov'])
  })
})

describe('bothEyesShape', () => {
  it('takes the farther or the nearer of the eyes, in directions both eyes have only', () => {
    const measures = { left: { left: 60, right: 40, up: 45 }, right: { left: 40, right: 60, down: 50 } }
    expect(bothEyesShape(measures, 'union')).toEqual({ left: 60, right: 60 })
    expect(bothEyesShape(measures, 'overlap')).toEqual({ left: 40, right: 40 })
  })
})

describe('solidAngleOf', () => {
  it('is a cone’s solid angle for a round outline', () => {
    expect(solidAngleOf(everyPrincipal(60))).toBeCloseTo(Math.PI, 12)
    expect(solidAngleOf(everyDirection(90))).toBeCloseTo(2 * Math.PI, 12)
  })

  it('follows a straight change of angle between two directions exactly', () => {
    // Up at 0° and every other principal direction at 90°: the stretches next to up rise from 0 to π/2
    // over a turn of π/4, each covering π/4 · (1 − 2/π).
    const shape = { ...everyPrincipal(90), up: 0 }
    const rising = (Math.PI / 4) * (1 - 2 / Math.PI)
    expect(solidAngleOf(shape)).toBeCloseTo(6 * (Math.PI / 4) + 2 * rising, 12)
  })

  it('needs three directions', () => {
    expect(solidAngleOf({ left: 50, right: 50 })).toBeUndefined()
  })
})

describe('viewAreasOf', () => {
  it('gives either eye’s and both eyes’ area as a share of the half sphere', () => {
    expect(viewAreasOf({ left: everyPrincipal(60), right: everyPrincipal(90) })).toEqual({ area: 100, overlapArea: 50 })
    expect(viewAreasOf({ left: { left: 50 }, right: { right: 50 } })).toEqual({ area: undefined, overlapArea: undefined })
  })

  it('rounds to a hundredth of a percent', () => {
    expect(halfSphereShare(1)).toBe(15.92)
  })
})
