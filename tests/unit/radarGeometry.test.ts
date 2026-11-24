import { describe, expect, it } from 'vitest'
import {
  ceilingTicks,
  plotRadius,
  radialScale,
  reachOf,
  ringsOf,
  shapePath,
  shapePoints,
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

  it('marks the ceiling across its spoke', () => {
    const [tick] = ceilingTicks({ right: 70 }, scale)
    expect(tick?.start.screenX).toBeCloseTo(plotRadius)
    expect(tick?.end.screenX).toBeCloseTo(plotRadius)
    expect(Math.abs((tick?.start.screenY ?? 0) - (tick?.end.screenY ?? 0))).toBeGreaterThan(10)
  })

  it('draws a ring every 10° and labels every third', () => {
    const rings = ringsOf(70, scale)
    expect(rings.map((ring) => ring.degrees)).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(rings.filter((ring) => ring.major).map((ring) => ring.degrees)).toEqual([30, 60])
    expect(rings.at(-1)?.radius).toBe(plotRadius)
  })

  it('draws a spoke per principal direction', () => {
    const spokes = spokesOf()
    expect(spokes).toHaveLength(8)
    expect(spokes[0]?.direction).toBe('up')
    expect(spokes[0]?.label.screenY).toBeLessThan(-plotRadius)
  })
})
