import { describe, expect, it } from 'vitest'
import { radialScale } from '../../src/lib/radarGeometry'
import { angleFromAhead, clipPolygon, clipSegment, project, sceneOf, scenePath, sceneShapes, type Point3, viewLimitDegrees } from '../../src/lib/scene'

const scale = radialScale(90)

describe('project', () => {
  it('puts straight ahead in the centre and turns into distance from it', () => {
    expect(project([0, 0, 5], scale)).toEqual([0, -0])
    const [right, level] = project([1, 0, 0], scale)
    expect(right).toBeCloseTo(scale(90))
    expect(level).toBeCloseTo(0)
    const [across, up] = project([0, 1, 1], scale)
    expect(across).toBeCloseTo(0)
    expect(up).toBeCloseTo(-scale(45))
    expect(Math.hypot(...project([0, 0, -1], scale))).toBeCloseTo(scale(viewLimitDegrees))
  })
})

describe('clipping', () => {
  const nearlyBehind: Point3 = [0.001, 0, -1]
  it('keeps shapes reaching past 90° whole', () => {
    expect(clipPolygon([[1, 0, 1], [1, 0, -1], [0, 1, -1]])).toHaveLength(3)
    expect(clipSegment([1, 0, 1], [1, 0, -1])).toEqual([[1, 0, 1], [1, 0, -1]])
  })
  it('cuts shapes just short of straight behind', () => {
    const cut = clipPolygon([[1, 0, -1], nearlyBehind, [0, 1, -1]])
    expect(cut).toHaveLength(4)
    expect(cut.every((point) => angleFromAhead(point) <= viewLimitDegrees)).toBe(true)
    expect(angleFromAhead(cut[1] ?? [0, 0, 1])).toBeCloseTo(viewLimitDegrees, 2)
    const [start, end] = clipSegment(nearlyBehind, [1, 0, 0]) ?? []
    expect(angleFromAhead(start ?? [0, 0, 1])).toBeCloseTo(viewLimitDegrees, 2)
    expect(end).toEqual([1, 0, 0])
    expect(angleFromAhead(clipSegment([1, 0, 0], nearlyBehind)?.[1] ?? [0, 0, 1])).toBeCloseTo(viewLimitDegrees, 2)
  })
  it('drops shapes wholly past the limit', () => {
    expect(clipPolygon([nearlyBehind, [0, 0.001, -1], [-0.001, 0, -1]])).toEqual([])
    expect(clipSegment(nearlyBehind, [0, 0.001, -1])).toBeNull()
  })
})

describe('scenePath', () => {
  it('draws an edge reaching past 90° to its full angle', () => {
    const wide = radialScale(180)
    const path = scenePath([[1, 0, 1], [1, 0, -1]], false, wide)
    const last = path.split('L').at(-1)?.split(',').map(Number) ?? []
    expect(Math.hypot(last[0] ?? 0, last[1] ?? 0)).toBeCloseTo(wide(135), 0)
  })

  it('splits long edges to follow their curve', () => {
    const open = scenePath([[-1, 0, 1], [1, 0, 1]], false, scale)
    expect(open.split('L').length).toBeGreaterThan(50)
    expect(open.endsWith('Z')).toBe(false)
    expect(scenePath([[0, 0, 1], [0.001, 0, 1], [0, 0.001, 1]], true, scale)).toMatch(/^M.*Z$/)
  })
})

describe('scenes', () => {
  it('projects the sketched scene once per reach', () => {
    const shapes = sceneShapes('void', 90, scale)
    expect(shapes.length).toBeGreaterThan(10)
    expect(sceneShapes('void', 90, scale)).toBe(shapes)
    expect(sceneOf('void')).toMatchObject({ name: 'Grid void', photo: null })
  })
  it('draws lines without fill and areas with one', () => {
    const shapes = sceneShapes('void', 90, scale)
    expect(shapes.some((shape) => shape.fill === 'none' && shape.strokeOpacity === 0.7)).toBe(true)
    expect(shapes.some((shape) => shape.fill !== 'none' && shape.stroke === undefined)).toBe(true)
  })
  it('shows the living room as a photo, with no shapes over it', () => {
    expect(sceneOf('room')).toMatchObject({ name: 'Living room', photo: 'scenes/living-room.webp' })
    expect(sceneShapes('room', 90, scale)).toEqual([])
  })
})
