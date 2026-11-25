import { describe, expect, it } from 'vitest'
import {
  ceilingWords,
  cornerMaskWords,
  isFlatPicture,
  pictureOutline,
  renderedFrameOf,
  type OutlinePoint,
} from '../../src/lib/ceiling'
import { atlasBeyond, testHmdQuest, vrhpBeyond, vrhpIndex, wimfovBeyond } from './siteFixtures'

const quarterTurn = Math.PI / 2
/** The outline point nearest a turn, as the radar would draw it on that spoke. */
function pointNear(points: readonly OutlinePoint[], turn: number): OutlinePoint | undefined {
  const distance = (point: OutlinePoint): number => Math.abs(Math.atan2(Math.sin(point.turn - turn), Math.cos(point.turn - turn)))
  return [...points].sort((first, second) => distance(first) - distance(second))[0]
}

describe('renderedFrameOf', () => {
  it('takes the edges read while measuring', () => {
    expect(renderedFrameOf(atlasBeyond)).toEqual({
      left: { left: 55, right: 42, up: 44.2, down: 54 },
      right: { left: 42, right: 55, up: 44.2, down: 54 },
      turn: 0,
    })
  })
  it('has none for a link’s totals or a tool without a report', () => {
    expect(renderedFrameOf(vrhpBeyond)).toBeUndefined()
    expect(renderedFrameOf(wimfovBeyond)).toBeUndefined()
  })
})

describe('pictureOutline', () => {
  const square = { left: 45, right: 45, up: 45, down: 45 }

  it('passes through each edge on its spoke and bends out toward the corners', () => {
    const points = pictureOutline(square, 0, 'left') ?? []
    expect(points).toHaveLength(64)
    expect(pointNear(points, 0)?.degrees).toBeCloseTo(45)
    expect(pointNear(points, quarterTurn)?.degrees).toBeCloseTo(45)
    expect(pointNear(points, Math.PI)?.degrees).toBeCloseTo(45)
    expect(pointNear(points, -quarterTurn)?.degrees).toBeCloseTo(45)
    expect(Math.max(...points.map((point) => point.degrees))).toBeCloseTo((Math.atan(Math.SQRT2) * 180) / Math.PI)
  })

  it('keeps the stored edges of a picture turned outward', () => {
    const edges = { left: 70, right: 30, up: 48, down: 48 }
    const left = pictureOutline(edges, 15, 'left') ?? []
    expect(pointNear(left, quarterTurn)?.degrees).toBeCloseTo(70)
    expect(pointNear(left, -quarterTurn)?.degrees).toBeCloseTo(30)
    expect(pointNear(left, 0)?.degrees).toBeCloseTo(48, 0)
    const right = pictureOutline({ ...edges, left: 30, right: 70 }, 15, 'right') ?? []
    expect(pointNear(right, -quarterTurn)?.degrees).toBeCloseTo(70)
    expect(pointNear(right, quarterTurn)?.degrees).toBeCloseTo(30)
    expect(Math.max(...right.map((point) => point.degrees))).toBeLessThan(180)
  })

  it.each([
    ['an edge at a right angle from the picture’s centre', { ...square, up: 90 }, 0],
    ['an outer edge past what a flat picture reaches', { ...square, left: 120 }, 10],
    ['edges that leave no picture', { ...square, left: 10, right: -20 }, 0],
    ['a top below the bottom', { ...square, up: -50 }, 0],
  ])('refuses %s', (_description, edges, turn) => {
    expect(pictureOutline(edges, turn, 'left')).toBeNull()
  })
})

describe('isFlatPicture', () => {
  const edges = { left: 70, right: 30, up: 48, down: 48 }

  it('accepts edges within a quarter turn of the picture’s centre, the turn taken into account', () => {
    expect(isFlatPicture(edges, 0, 'left')).toBe(true)
    expect(isFlatPicture({ ...edges, left: 115 }, 30, 'left')).toBe(true)
    expect(isFlatPicture({ ...edges, left: 30, right: 115 }, 30, 'right')).toBe(true)
  })

  it.each([
    ['a top at a right angle', { ...edges, up: 90 }, 0, 'left'],
    ['a bottom past a right angle', { ...edges, down: 95 }, 0, 'right'],
    ['an outer edge a quarter turn from the turned picture’s centre', { ...edges, left: 120 }, 30, 'left'],
    ['an outer edge past it, right eye', { ...edges, right: 130 }, 30, 'right'],
    ['an inner edge pushed past it by the turn', { ...edges, right: 70 }, 25, 'left'],
  ] as const)('refuses %s', (_description, angles, turn, eye) => {
    expect(isFlatPicture(angles, turn, eye)).toBe(false)
  })
})

describe('words', () => {
  it('names where the rendered field of view comes from', () => {
    expect(ceilingWords(atlasBeyond)).toBe('Read while measuring')
    expect(ceilingWords(vrhpBeyond)).toBe('From the tool’s link')
    expect(ceilingWords(vrhpIndex)).toBe('Not reported')
    expect(ceilingWords(testHmdQuest)).toBe('Not reported')
  })
  it('says what is known of the corner mask, never asking', () => {
    expect(cornerMaskWords(atlasBeyond)).toBe('corner mask detected')
    expect(cornerMaskWords({ ...atlasBeyond, cornerMask: 'unknown' })).toBe('corner mask not reported')
    expect(cornerMaskWords(vrhpBeyond)).toBe('corner mask unknown')
  })
})
