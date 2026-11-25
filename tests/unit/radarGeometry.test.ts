import { describe, expect, it } from 'vitest'
import {
  outlinePath,
  plotRadius,
  radialScale,
  reachOf,
  missesPrincipal,
  ringsOf,
  shapePath,
  shapePoints,
  shapeSpans,
  spokesOf,
  turnOf,
} from '../../src/lib/radarGeometry'

describe('reachOf', () => {
  it.each([
    [0, 70],
    [55, 70],
    [71, 80],
    [120, 120],
    [179.5, 180],
  ])('reaches past %d° to %d°', (largest, reach) => {
    expect(reachOf(largest)).toBe(reach)
  })
})

describe('positions', () => {
  const scale = radialScale(70)
  it('puts up at the top and the wearer’s left on the left', () => {
    const [up, left] = shapePoints({ up: 70, left: 35 }, scale)
    expect(up?.screenX).toBeCloseTo(0)
    expect(up?.screenY).toBeCloseTo(-plotRadius)
    expect(left?.screenX).toBeCloseTo(-plotRadius / 2)
    expect(left?.screenY).toBeCloseTo(0)
    expect(turnOf('right')).toBeCloseTo((3 * Math.PI) / 2)
  })

  it('draws a closed smooth curve through two points or more', () => {
    expect(shapePath({ up: 40 }, scale)).toBe('')
    const path = shapePath({ up: 40, left: 50, down: 45, right: 50 }, scale)
    expect(path.startsWith('M')).toBe(true)
    expect(path).toContain('C')
  })

  it('draws a straight-sided closed outline through turns and angles', () => {
    expect(outlinePath([{ turn: 0, degrees: 40 }], scale)).toBe('')
    const path = outlinePath(
      [
        { turn: 0, degrees: 70 },
        { turn: Math.PI / 2, degrees: 70 },
        { turn: Math.PI, degrees: 70 },
      ],
      scale,
    )
    expect(path).toMatch(/^M0,-210L-210,0L0,210Z$/)
  })

  it('draws a ring every 10° and labels every third', () => {
    const rings = ringsOf(70, scale)
    expect(rings.map((ring) => ring.degrees)).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(rings.filter((ring) => ring.major).map((ring) => ring.degrees)).toEqual([30, 60])
    expect(rings.at(-1)?.radius).toBe(plotRadius)
    expect(ringsOf(95, scale, 30).map((ring) => ring.degrees)).toEqual([30, 60, 90])
  })

  it('draws a spoke per principal direction', () => {
    const spokes = spokesOf()
    expect(spokes).toHaveLength(8)
    expect(spokes[0]?.direction).toBe('up')
    expect(spokes[0]?.label.screenY).toBeLessThan(-plotRadius)
  })
})

describe('shapeSpans', () => {
  const scale = radialScale(90)
  const principal = { up: 40, 'up-left': 50, left: 55, 'down-left': 60, down: 50, 'down-right': 52, right: 45, 'up-right': 48 }
  const numbersOf = (text: string): number[] => text.split(',').map(Number)
  const endOf = (path: string): number[] => path.split(/[C,]/).slice(-2).map(Number)
  const startOf = (path: string): number[] => numbersOf(path.slice(1).split('C')[0] ?? '')
  const expectNear = (actual: readonly number[], expected: readonly number[]): void => {
    expect(actual).toHaveLength(2)
    actual.forEach((value, valueIndex) => {
      expect(value).toBeCloseTo(expected.at(valueIndex) ?? Number.NaN, 2)
    })
  }

  it('draws a fully measured shape as one solid closed curve, in-betweens optional', () => {
    expect(shapeSpans(principal, scale)).toEqual([{ path: shapePath(principal, scale), measured: true }])
    const withInBetween = { ...principal, 'up-up-left': 46 }
    expect(shapeSpans(withInBetween, scale)).toEqual([{ path: shapePath(withInBetween, scale), measured: true }])
    expect(missesPrincipal(principal)).toBe(false)
  })

  it('dashes the stretches passing over an unmeasured principal direction', () => {
    // One eye of VR Headset Picker: four edges and one diagonal.
    const leftEye = { up: 40, left: 55, 'down-left': 60, down: 50, right: 45 }
    const spans = shapeSpans(leftEye, scale)
    expect(missesPrincipal(leftEye)).toBe(true)
    expect(spans.map((span) => span.measured)).toEqual([true, false])
    const points = shapePoints(leftEye, scale)
    const at = (direction: string): number[] => {
      const point = points.find((candidate) => candidate.direction === direction)
      return [point?.screenX ?? Number.NaN, point?.screenY ?? Number.NaN]
    }
    const [leftToDown, downRoundToLeft] = spans
    // Left through the measured diagonal to down.
    expectNear(startOf(leftToDown?.path ?? ''), at('left'))
    expectNear(endOf(leftToDown?.path ?? ''), at('down'))
    // Down round through right and up back to left, missing down-right, up-right and up-left.
    expectNear(startOf(downRoundToLeft?.path ?? ''), at('down'))
    expectNear(endOf(downRoundToLeft?.path ?? ''), at('left'))
    expect(downRoundToLeft?.path.split('C')).toHaveLength(4)
    expect(spans.every((span) => span.path.startsWith('M') && !span.path.endsWith('Z'))).toBe(true)
  })

  it('dashes all of a curve that joins only the four edges', () => {
    const edges = { up: 40, left: 55, down: 50, right: 45 }
    expect(shapeSpans(edges, scale)).toEqual([{ path: shapePath(edges, scale), measured: false }])
  })

  it('draws too few points as unmeasured or not at all', () => {
    expect(shapeSpans({ up: 40 }, scale)).toEqual([])
    expect(shapeSpans({ up: 40, down: 40 }, scale)).toEqual([{ path: shapePath({ up: 40, down: 40 }, scale), measured: false }])
  })
})
